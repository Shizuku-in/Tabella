use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use axum_extra::extract::CookieJar;
use serde_json::json;

use crate::{
    AppState,
    dto::{
        ImageListItem, ImageSort, ListImagesQuery, ListImagesResponse, Rating, TagSuggestQuery,
        UpdateImageRequest,
    },
    tags::parse_tag,
};

use super::{
    error::ApiError,
    guards::{require_editor, require_user},
};

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/images", get(list_images))
        .route(
            "/api/images/{image_id}",
            patch(update_image).delete(delete_image),
        )
        .route("/api/tags/suggest", get(suggest_tags))
        .route(
            "/api/favorites/{image_id}",
            post(add_favorite).delete(remove_favorite),
        )
        .with_state(state)
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct ImageListRow {
    id: i64,
    original_filename: String,
    thumbnail_path: String,
    preview_path: String,
    original_path: String,
    width: i32,
    height: i32,
    sha256: String,
    source_url: Option<String>,
    note: Option<String>,
    rating: String,
    file_size: i64,
    is_favorite: bool,
    tags: Vec<String>,
    imported_at: time::OffsetDateTime,
    sort_filename: String,
    uploader_id: Option<i64>,
    uploader_username: Option<String>,
    uploader_avatar_url: Option<String>,
    #[sqlx(default)]
    sort_hash: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct ImageListCursor {
    id: i64,
    imported_at: Option<time::OffsetDateTime>,
    filename: Option<String>,
    hash: Option<String>,
}

async fn list_images(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<ListImagesQuery>,
) -> Result<Json<ListImagesResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;
    let include_tags: Vec<String> = query
        .include_tags
        .iter()
        .filter_map(|tag| normalize_tag_filter(tag))
        .collect();
    let exclude_tags: Vec<String> = query
        .exclude_tags
        .iter()
        .filter_map(|tag| normalize_tag_filter(tag))
        .collect();
    let cursor = query
        .cursor
        .as_deref()
        .map(decode_image_cursor)
        .transpose()?;

    let limit = query.limit.unwrap_or(50).clamp(1, 100) as i64;
    let mut builder = sqlx::QueryBuilder::new(
        "SELECT i.id, i.original_filename, i.thumbnail_path, i.preview_path, i.original_path, \
         i.width, i.height, i.sha256, i.source_url, i.note, i.rating, i.file_size, i.imported_at, lower(i.original_filename) AS sort_filename, \
         md5(i.id::text || ",
    );
    builder.push_bind(query.seed.unwrap_or(0).to_string());
    builder.push(
        ") AS sort_hash, \
         EXISTS (SELECT 1 FROM favorites f WHERE f.image_id = i.id AND f.user_id = ",
    );
    builder.push_bind(user.id);
    builder.push(
        ") AS is_favorite, \
         COALESCE(ARRAY( \
             SELECT CASE WHEN t.namespace = '' THEN t.name ELSE t.namespace || ':' || t.name END \
             FROM image_tags it \
             JOIN tags t ON t.id = it.tag_id \
             WHERE it.image_id = i.id \
             ORDER BY t.namespace, t.name \
         ), '{}') AS tags, \
         u.id AS uploader_id, u.username AS uploader_username, u.avatar_url AS uploader_avatar_url \
         FROM images i \
         LEFT JOIN users u ON u.id = i.uploader_id \
         WHERE 1=1 ",
    );

    if query.favorites_only {
        builder.push(
            " AND EXISTS (SELECT 1 FROM favorites f WHERE f.image_id = i.id AND f.user_id = ",
        );
        builder.push_bind(user.id);
        builder.push(") ");
    }

    if let Some(uploaded_after) = query.uploaded_after {
        builder.push(" AND i.imported_at >= ");
        builder.push_bind(uploaded_after);
    }

    if let Some(uploaded_before) = query.uploaded_before {
        builder.push(" AND i.imported_at <= ");
        builder.push_bind(uploaded_before);
    }

    if let Some(min_width) = query.min_width {
        builder.push(" AND i.width >= ");
        builder.push_bind(min_width as i32);
    }

    if let Some(min_height) = query.min_height {
        builder.push(" AND i.height >= ");
        builder.push_bind(min_height as i32);
    }

    if let Some(ar_min) = query.aspect_ratio_min {
        builder.push(" AND (i.width::float / i.height::float) >= ");
        builder.push_bind(ar_min);
    }

    if let Some(ar_max) = query.aspect_ratio_max {
        builder.push(" AND (i.width::float / i.height::float) <= ");
        builder.push_bind(ar_max);
    }

    if !query.rating.is_empty() {
        builder.push(" AND i.rating = ANY(");
        let ratings: Vec<&str> = query.rating.iter().map(|rating| rating.as_str()).collect();
        builder.push_bind(ratings);
        builder.push(") ");
    }

    for tag in &include_tags {
        let (namespace, name) = match tag.find(':') {
            Some(pos) => (Some(&tag[..pos]), &tag[pos + 1..]),
            None => (None, tag.as_str()),
        };

        builder.push(
            " AND EXISTS ( \
                SELECT 1 \
                FROM image_tags it \
                JOIN tags t ON t.id = it.tag_id \
                WHERE it.image_id = i.id AND t.normalized_name = ",
        );
        builder.push_bind(name);
        if let Some(ns) = namespace {
            builder.push(" AND t.normalized_namespace = ");
            builder.push_bind(ns);
        }
        builder.push(") ");
    }

    for tag in &exclude_tags {
        let (namespace, name) = match tag.find(':') {
            Some(pos) => (Some(&tag[..pos]), &tag[pos + 1..]),
            None => (None, tag.as_str()),
        };

        builder.push(
            " AND NOT EXISTS ( \
                SELECT 1 \
                FROM image_tags it \
                JOIN tags t ON t.id = it.tag_id \
                WHERE it.image_id = i.id AND t.normalized_name = ",
        );
        builder.push_bind(name);
        if let Some(ns) = namespace {
            builder.push(" AND t.normalized_namespace = ");
            builder.push_bind(ns);
        }
        builder.push(") ");
    }

    if let Some(cursor) = &cursor {
        push_image_cursor_filter(&mut builder, query.sort, cursor, query.seed)?;
    }

    push_image_sort_order(&mut builder, query.sort);
    builder.push(" LIMIT ");
    builder.push_bind(limit + 1);

    let mut rows: Vec<ImageListRow> = builder
        .build_query_as()
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let next_cursor = if rows.len() > limit as usize {
        rows.pop();
        rows.last()
            .map(|row| encode_image_cursor(query.sort, row))
            .transpose()?
    } else {
        None
    };

    let mut items = Vec::new();
    for row in rows {
        let rating = match row.rating.as_str() {
            "suggestive" => Rating::Suggestive,
            "explicit" => Rating::Explicit,
            _ => Rating::Safe,
        };

        let uploader = match (
            row.uploader_id,
            row.uploader_username,
            row.uploader_avatar_url,
        ) {
            (Some(id), Some(username), avatar_url) => Some(crate::dto::ImageUploader {
                id,
                username,
                avatar_url,
            }),
            _ => None,
        };

        items.push(ImageListItem {
            id: row.id,
            original_filename: row.original_filename,
            thumbnail_url: format!("/media/{}", row.thumbnail_path),
            preview_url: format!("/media/{}", row.preview_path),
            original_url: (!row.original_path.is_empty())
                .then(|| format!("/media/{}", row.original_path)),
            width: row.width as u32,
            height: row.height as u32,
            sha256: row.sha256,
            source_url: row.source_url,
            note: row.note,
            imported_at: row.imported_at,
            rating,
            is_favorite: row.is_favorite,
            tags: row.tags,
            file_size: row.file_size,
            uploader,
        });
    }

    Ok(Json(ListImagesResponse { items, next_cursor }))
}

fn normalize_tag_filter(tag: &str) -> Option<String> {
    let normalized = tag.trim().to_lowercase();
    (!normalized.is_empty()).then_some(normalized)
}

fn decode_image_cursor(raw: &str) -> Result<ImageListCursor, ApiError> {
    serde_json::from_str(raw).map_err(|_| {
        ApiError::bad_request(
            crate::api::error_codes::INVALID_CURSOR,
            "Invalid image pagination cursor.",
        )
    })
}

fn push_image_cursor_filter(
    builder: &mut sqlx::QueryBuilder<'_, sqlx::Postgres>,
    sort: ImageSort,
    cursor: &ImageListCursor,
    seed: Option<i32>,
) -> Result<(), ApiError> {
    match sort {
        ImageSort::Newest => {
            let imported_at = cursor.imported_at.ok_or_else(|| {
                ApiError::bad_request(
                    crate::api::error_codes::CURSOR_MISSING_IMPORTED_AT,
                    "Missing imported_at in image cursor.",
                )
            })?;
            builder.push(" AND (i.imported_at, i.id) < (");
            builder.push_bind(imported_at);
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
        ImageSort::Oldest => {
            let imported_at = cursor.imported_at.ok_or_else(|| {
                ApiError::bad_request(
                    crate::api::error_codes::CURSOR_MISSING_IMPORTED_AT,
                    "Missing imported_at in image cursor.",
                )
            })?;
            builder.push(" AND (i.imported_at, i.id) > (");
            builder.push_bind(imported_at);
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
        ImageSort::FilenameAsc => {
            let filename = cursor
                .filename
                .clone()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    ApiError::bad_request(
                        crate::api::error_codes::CURSOR_MISSING_FILENAME,
                        "Missing filename in image cursor.",
                    )
                })?;
            builder.push(" AND (lower(i.original_filename), i.id) > (");
            builder.push_bind(filename);
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
        ImageSort::FilenameDesc => {
            let filename = cursor
                .filename
                .clone()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    ApiError::bad_request(
                        crate::api::error_codes::CURSOR_MISSING_FILENAME,
                        "Missing filename in image cursor.",
                    )
                })?;
            builder.push(" AND (lower(i.original_filename), i.id) < (");
            builder.push_bind(filename);
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
        ImageSort::Random => {
            let hash = cursor.hash.as_ref().ok_or_else(|| {
                ApiError::bad_request("Invalid cursor", "Missing hash in image cursor.")
            })?;
            builder.push(" AND (md5(i.id::text || ");
            builder.push_bind(seed.unwrap_or(0).to_string());
            builder.push("), i.id) < (");
            builder.push_bind(hash.clone());
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
    }

    Ok(())
}

fn push_image_sort_order(builder: &mut sqlx::QueryBuilder<'_, sqlx::Postgres>, sort: ImageSort) {
    match sort {
        ImageSort::Newest => {
            builder.push(" ORDER BY i.imported_at DESC, i.id DESC ");
        }
        ImageSort::Oldest => {
            builder.push(" ORDER BY i.imported_at ASC, i.id ASC ");
        }
        ImageSort::FilenameAsc => {
            builder.push(" ORDER BY lower(i.original_filename) ASC, i.id ASC ");
        }
        ImageSort::FilenameDesc => {
            builder.push(" ORDER BY lower(i.original_filename) DESC, i.id DESC ");
        }
        ImageSort::Random => {
            builder.push(" ORDER BY sort_hash DESC, i.id DESC ");
        }
    }
}

fn encode_image_cursor(sort: ImageSort, row: &ImageListRow) -> Result<String, ApiError> {
    let cursor = match sort {
        ImageSort::Newest | ImageSort::Oldest => ImageListCursor {
            id: row.id,
            imported_at: Some(row.imported_at),
            filename: None,
            hash: None,
        },
        ImageSort::FilenameAsc | ImageSort::FilenameDesc => ImageListCursor {
            id: row.id,
            imported_at: None,
            filename: Some(row.sort_filename.clone()),
            hash: None,
        },
        ImageSort::Random => ImageListCursor {
            id: row.id,
            imported_at: None,
            filename: None,
            hash: row.sort_hash.clone(),
        },
    };

    serde_json::to_string(&cursor).map_err(|error| ApiError::internal(error.into()))
}

async fn update_image(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
    Json(body): Json<UpdateImageRequest>,
) -> Result<Response, ApiError> {
    let _user = require_editor(&state, &jar).await?;

    if let Some(rating) = &body.rating {
        sqlx::query("UPDATE images SET rating = $1, updated_at = now() WHERE id = $2")
            .bind(rating.as_str())
            .bind(image_id)
            .execute(&state.pool)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;
    }

    if let Some(tags) = &body.tags {
        let mut tx = state
            .pool
            .begin()
            .await
            .map_err(|e| ApiError::internal(e.into()))?;

        // Remember which tags this image had so we can prune any that become
        // orphaned once the old associations are replaced below.
        let previous_tag_ids = crate::tags::image_tag_ids(&mut tx, image_id)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;

        sqlx::query("DELETE FROM image_tags WHERE image_id = $1")
            .bind(image_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;

        for tag_str in tags {
            let Some(tag) = parse_tag(tag_str) else {
                continue;
            };

            crate::tags::attach_tag_to_image(&mut tx, image_id, &tag)
                .await
                .map_err(|e| ApiError::internal(e.into()))?;
        }

        crate::tags::cleanup_orphan_tags(&mut tx, &previous_tag_ids)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;

        tx.commit()
            .await
            .map_err(|e| ApiError::internal(e.into()))?;
    }

    Ok(StatusCode::NO_CONTENT.into_response())
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct ImageFileRow {
    original_path: String,
    preview_path: String,
    thumbnail_path: String,
}

async fn delete_image(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
) -> Result<Response, ApiError> {
    let _user = require_editor(&state, &jar).await?;

    let row: ImageFileRow = sqlx::query_as(
        "SELECT original_path, preview_path, thumbnail_path FROM images WHERE id = $1",
    )
    .bind(image_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?
    .ok_or_else(|| {
        ApiError::not_found(crate::api::error_codes::IMAGE_NOT_FOUND, "Image not found.")
    })?;

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    // Capture the image's tags before deletion so we can prune any that become
    // orphaned. The image delete cascades away the image_tags rows but leaves
    // the tags themselves behind.
    let previous_tag_ids = crate::tags::image_tag_ids(&mut tx, image_id)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    sqlx::query("DELETE FROM images WHERE id = $1")
        .bind(image_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    crate::tags::cleanup_orphan_tags(&mut tx, &previous_tag_ids)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    // File removal happens after the DB commit: it can't be rolled back, and a
    // missing file is non-fatal (logged below).
    let paths = [
        state.config.media_root.join(&row.original_path),
        state.config.media_root.join(&row.preview_path),
        state.config.media_root.join(&row.thumbnail_path),
    ];

    for path in &paths {
        if let Err(e) = tokio::fs::remove_file(path).await
            && e.kind() != std::io::ErrorKind::NotFound
        {
            tracing::warn!(path = ?path, error = ?e, "failed to delete image file");
        }
    }

    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn suggest_tags(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<TagSuggestQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let _user = require_user(&state, &jar).await?;

    let limit = query.limit.unwrap_or(20).clamp(1, 50) as i64;
    let search = query.q.to_lowercase();

    let items: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT CASE WHEN namespace = '' THEN name ELSE namespace || ':' || name END AS tag_display
        FROM tags
        WHERE normalized_name LIKE $1 || '%'
           OR (normalized_namespace || ':' || normalized_name) LIKE $1 || '%'
        ORDER BY namespace, name
        LIMIT $2
        "#,
    )
    .bind(&search)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    Ok(Json(json!({
        "items": items
    })))
}

async fn add_favorite(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
) -> Result<Response, ApiError> {
    let user = require_user(&state, &jar).await?;

    sqlx::query("INSERT INTO favorites (user_id, image_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(user.id)
        .bind(image_id)
        .execute(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn remove_favorite(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
) -> Result<Response, ApiError> {
    let user = require_user(&state, &jar).await?;

    sqlx::query("DELETE FROM favorites WHERE user_id = $1 AND image_id = $2")
        .bind(user.id)
        .bind(image_id)
        .execute(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    Ok(StatusCode::NO_CONTENT.into_response())
}

#[cfg(test)]
mod tests {
    use super::{ImageListRow, decode_image_cursor, encode_image_cursor};
    use crate::dto::ImageSort;

    #[test]
    fn image_cursor_round_trips_for_filename_sort() {
        let row = ImageListRow {
            id: 42,
            original_filename: String::from("cover.jpg"),
            thumbnail_path: String::from("thumb.webp"),
            preview_path: String::from("preview.webp"),
            original_path: String::from("originals/cover.jpg"),
            width: 1200,
            height: 800,
            sha256: String::from("abc123"),
            source_url: None,
            note: None,
            rating: String::from("safe"),
            file_size: 1024,
            is_favorite: false,
            tags: vec![String::from("artist:umi")],
            imported_at: time::OffsetDateTime::from_unix_timestamp(1_717_312_000).unwrap(),
            sort_filename: String::from("cover.jpg"),
            uploader_id: None,
            uploader_username: None,
            uploader_avatar_url: None,
            sort_hash: None,
        };

        let encoded = encode_image_cursor(ImageSort::FilenameAsc, &row).unwrap();
        let decoded = decode_image_cursor(&encoded).unwrap();

        assert_eq!(decoded.id, row.id);
        assert_eq!(decoded.filename.as_deref(), Some("cover.jpg"));
        assert!(decoded.imported_at.is_none());
    }

    #[test]
    fn image_cursor_round_trips_for_random_sort() {
        let row = ImageListRow {
            id: 123,
            original_filename: String::from("cover.jpg"),
            thumbnail_path: String::from("thumbnail/path"),
            preview_path: String::from("preview/path"),
            original_path: String::from("original/path"),
            width: 800,
            height: 600,
            sha256: String::from("hash123"),
            source_url: None,
            note: None,
            rating: String::from("safe"),
            file_size: 1024,
            is_favorite: false,
            tags: vec![],
            imported_at: time::OffsetDateTime::now_utc(),
            sort_filename: String::from("cover.jpg"),
            uploader_id: None,
            uploader_username: None,
            uploader_avatar_url: None,
            sort_hash: Some(String::from("randomhash123")),
        };

        let encoded = encode_image_cursor(ImageSort::Random, &row).unwrap();
        let decoded = decode_image_cursor(&encoded).unwrap();

        assert_eq!(decoded.id, row.id);
        assert_eq!(decoded.hash.as_deref(), Some("randomhash123"));
    }
}
