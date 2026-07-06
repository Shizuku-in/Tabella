//! Tag model: `namespace:name` convention, lowercase normalization for lookups.
//! Display names are preserved separately.

use sqlx::PgConnection;

/// A parsed tag with both display and normalized forms.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedTag {
    pub(crate) namespace: String,
    pub(crate) name: String,
    pub(crate) normalized_namespace: String,
    pub(crate) normalized_name: String,
}

/// Links an image to a set of tags in 3 queries (regardless of tag count):
/// bulk upsert → bulk id lookup → bulk `image_tags` insert. Idempotent:
/// existing tags and links are silently skipped via `ON CONFLICT DO NOTHING`.
pub(crate) async fn bulk_attach_tags_to_image(
    conn: &mut PgConnection,
    image_id: i64,
    tags: &[ParsedTag],
) -> Result<(), sqlx::Error> {
    if tags.is_empty() {
        return Ok(());
    }

    let namespaces: Vec<&str> = tags.iter().map(|t| t.namespace.as_str()).collect();
    let names: Vec<&str> = tags.iter().map(|t| t.name.as_str()).collect();
    let nn: Vec<&str> = tags
        .iter()
        .map(|t| t.normalized_namespace.as_str())
        .collect();
    let nm: Vec<&str> = tags.iter().map(|t| t.normalized_name.as_str()).collect();

    // 1. Bulk upsert all tags.
    sqlx::query(
        r#"
        INSERT INTO tags (namespace, name, normalized_namespace, normalized_name)
        SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
        ON CONFLICT (normalized_namespace, normalized_name) DO NOTHING
        "#,
    )
    .bind(&namespaces)
    .bind(&names)
    .bind(&nn)
    .bind(&nm)
    .execute(&mut *conn)
    .await?;

    // 2. Fetch all tag ids (existing + just-inserted) in one query.
    let tag_ids: Vec<i64> = sqlx::query_scalar(
        r#"
        WITH input(ns, nm) AS (
            SELECT * FROM UNNEST($1::text[], $2::text[])
        )
        SELECT t.id FROM tags t
        INNER JOIN input ON t.normalized_namespace = input.ns AND t.normalized_name = input.nm
        "#,
    )
    .bind(&nn)
    .bind(&nm)
    .fetch_all(&mut *conn)
    .await?;

    // 3. Bulk link to the image.
    sqlx::query(
        r#"
        INSERT INTO image_tags (image_id, tag_id)
        SELECT $1, UNNEST($2::bigint[])
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(image_id)
    .bind(&tag_ids)
    .execute(&mut *conn)
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

/// Parses a `namespace:name` or bare `name` string. Returns `None` for empty
/// or whitespace-only input.
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
