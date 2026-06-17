use sqlx::PgConnection;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedTag {
    pub(crate) namespace: String,
    pub(crate) name: String,
    pub(crate) normalized_namespace: String,
    pub(crate) normalized_name: String,
}

/// Finds an existing tag by its normalized identity, inserting it if absent,
/// and returns the tag id. Safe to call concurrently thanks to the
/// `ON CONFLICT` upsert. Takes a `&mut PgConnection` so callers can run it
/// inside a transaction (a `&PgPool`, pooled connection, or `&mut Transaction`
/// all coerce in).
pub(crate) async fn upsert_tag(
    conn: &mut PgConnection,
    tag: &ParsedTag,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        WITH new_tag AS (
            INSERT INTO tags (namespace, name, normalized_namespace, normalized_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (normalized_namespace, normalized_name) DO NOTHING
            RETURNING id
        )
        SELECT id FROM new_tag
        UNION ALL
        SELECT id FROM tags WHERE normalized_namespace = $3 AND normalized_name = $4
        LIMIT 1
        "#,
    )
    .bind(&tag.namespace)
    .bind(&tag.name)
    .bind(&tag.normalized_namespace)
    .bind(&tag.normalized_name)
    .fetch_one(conn)
    .await
}

/// Upserts a tag and links it to the given image. Idempotent: re-linking an
/// already-attached tag is a no-op.
pub(crate) async fn attach_tag_to_image(
    conn: &mut PgConnection,
    image_id: i64,
    tag: &ParsedTag,
) -> Result<(), sqlx::Error> {
    let tag_id = upsert_tag(conn, tag).await?;
    sqlx::query("INSERT INTO image_tags (image_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(image_id)
        .bind(tag_id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Returns the tag ids currently linked to an image. Useful for capturing the
/// set before a rewrite/delete so newly-orphaned tags can be pruned afterwards.
pub(crate) async fn image_tag_ids(
    conn: &mut PgConnection,
    image_id: i64,
) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar("SELECT tag_id FROM image_tags WHERE image_id = $1")
        .bind(image_id)
        .fetch_all(conn)
        .await
}

/// Deletes tags from `candidate_ids` that no longer reference any image, so a
/// tag stops appearing in suggestions once nothing uses it. Scoped to the given
/// ids so editing/deleting one image only touches the tags that image had.
pub(crate) async fn cleanup_orphan_tags(
    conn: &mut PgConnection,
    candidate_ids: &[i64],
) -> Result<(), sqlx::Error> {
    if candidate_ids.is_empty() {
        return Ok(());
    }

    let result = sqlx::query(
        r#"
        DELETE FROM tags
        WHERE id = ANY($1)
          AND NOT EXISTS (SELECT 1 FROM image_tags WHERE tag_id = tags.id)
        "#,
    )
    .bind(candidate_ids)
    .execute(conn)
    .await?;

    let removed = result.rows_affected();
    if removed > 0 {
        tracing::debug!(removed, "pruned orphan tags");
    }

    Ok(())
}

pub(crate) fn parse_tag(tag: &str) -> Option<ParsedTag> {
    let trimmed = tag.trim();
    if trimmed.is_empty() {
        return None;
    }

    let (namespace, name) = match trimmed.split_once(':') {
        Some((namespace, name)) if !namespace.trim().is_empty() && !name.trim().is_empty() => {
            (namespace.trim().to_string(), name.trim().to_string())
        }
        _ => (String::new(), trimmed.to_string()),
    };

    Some(ParsedTag {
        normalized_namespace: namespace.to_lowercase(),
        normalized_name: name.to_lowercase(),
        namespace,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_tag;

    #[test]
    fn parse_tag_preserves_namespace_when_present() {
        let parsed = parse_tag("artist:anmi").unwrap();
        assert_eq!(parsed.namespace, "artist");
        assert_eq!(parsed.name, "anmi");
        assert_eq!(parsed.normalized_namespace, "artist");
        assert_eq!(parsed.normalized_name, "anmi");
    }

    #[test]
    fn parse_tag_keeps_unprefixed_tags_compatible() {
        let parsed = parse_tag("1girl").unwrap();
        assert_eq!(parsed.namespace, "");
        assert_eq!(parsed.name, "1girl");
        assert_eq!(parsed.normalized_namespace, "");
        assert_eq!(parsed.normalized_name, "1girl");
    }

    #[test]
    fn parse_tag_falls_back_when_prefix_is_incomplete() {
        let parsed = parse_tag("artist:").unwrap();
        assert_eq!(parsed.namespace, "");
        assert_eq!(parsed.name, "artist:");
    }
}
