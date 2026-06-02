use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use serde_json::json;

use crate::{
    AppState,
    dto::{
        ImageListItem, ImageSort, ListImagesQuery, ListImagesResponse, Rating, TagSuggestQuery,
    },
};

use super::{error::ApiError, guards::require_user};

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/images", get(list_images))
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
    rating: String,
    file_size: i64,
    is_favorite: bool,
    tags: Vec<String>,
    imported_at: time::OffsetDateTime,
    sort_filename: String,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct ImageListCursor {
    id: i64,
    imported_at: Option<time::OffsetDateTime>,
    filename: Option<String>,
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
         i.width, i.height, i.rating, i.file_size, i.imported_at, lower(i.original_filename) AS sort_filename, \
         EXISTS (SELECT 1 FROM favorites f WHERE f.image_id = i.id AND f.user_id = ",
    );
    builder.push_bind(user.id);
    builder.push(
        ") AS is_favorite, \
         COALESCE(ARRAY( \
             SELECT t.name \
             FROM image_tags it \
             JOIN tags t ON t.id = it.tag_id \
             WHERE it.image_id = i.id \
             ORDER BY t.name \
         ), '{}') AS tags \
         FROM images i \
         WHERE 1=1 ",
    );

    if query.favorites_only {
        builder.push(
            " AND EXISTS (SELECT 1 FROM favorites f WHERE f.image_id = i.id AND f.user_id = ",
        );
        builder.push_bind(user.id);
        builder.push(") ");
    }

    if !query.rating.is_empty() {
        builder.push(" AND i.rating = ANY(");
        let ratings: Vec<&str> = query.rating.iter().map(|rating| rating.as_str()).collect();
        builder.push_bind(ratings);
        builder.push(") ");
    }

    for tag in &include_tags {
        builder.push(
            " AND EXISTS ( \
                SELECT 1 \
                FROM image_tags it \
                JOIN tags t ON t.id = it.tag_id \
                WHERE it.image_id = i.id AND t.normalized_name = ",
        );
        builder.push_bind(tag);
        builder.push(") ");
    }

    for tag in &exclude_tags {
        builder.push(
            " AND NOT EXISTS ( \
                SELECT 1 \
                FROM image_tags it \
                JOIN tags t ON t.id = it.tag_id \
                WHERE it.image_id = i.id AND t.normalized_name = ",
        );
        builder.push_bind(tag);
        builder.push(") ");
    }

    if let Some(cursor) = &cursor {
        push_image_cursor_filter(&mut builder, query.sort, cursor)?;
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

        items.push(ImageListItem {
            id: row.id,
            original_filename: row.original_filename,
            thumbnail_url: format!("/media/{}", row.thumbnail_path),
            preview_url: format!("/media/{}", row.preview_path),
            original_url: (!row.original_path.is_empty())
                .then(|| format!("/media/{}", row.original_path)),
            width: row.width as u32,
            height: row.height as u32,
            rating,
            is_favorite: row.is_favorite,
            tags: row.tags,
            file_size: row.file_size,
        });
    }

    Ok(Json(ListImagesResponse { items, next_cursor }))
}

fn normalize_tag_filter(tag: &str) -> Option<String> {
    let normalized = tag.trim().to_lowercase();
    (!normalized.is_empty()).then_some(normalized)
}

fn decode_image_cursor(raw: &str) -> Result<ImageListCursor, ApiError> {
    serde_json::from_str(raw)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "Invalid image pagination cursor."))
}

fn push_image_cursor_filter(
    builder: &mut sqlx::QueryBuilder<'_, sqlx::Postgres>,
    sort: ImageSort,
    cursor: &ImageListCursor,
) -> Result<(), ApiError> {
    match sort {
        ImageSort::Newest => {
            let imported_at = cursor.imported_at.ok_or_else(|| {
                ApiError::bad_request("invalid_cursor", "Missing imported_at in image cursor.")
            })?;
            builder.push(" AND (i.imported_at, i.id) < (");
            builder.push_bind(imported_at);
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
        ImageSort::Oldest => {
            let imported_at = cursor.imported_at.ok_or_else(|| {
                ApiError::bad_request("invalid_cursor", "Missing imported_at in image cursor.")
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
                    ApiError::bad_request("invalid_cursor", "Missing filename in image cursor.")
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
                    ApiError::bad_request("invalid_cursor", "Missing filename in image cursor.")
                })?;
            builder.push(" AND (lower(i.original_filename), i.id) < (");
            builder.push_bind(filename);
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
    }

    Ok(())
}

fn push_image_sort_order(
    builder: &mut sqlx::QueryBuilder<'_, sqlx::Postgres>,
    sort: ImageSort,
) {
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
    }
}

fn encode_image_cursor(sort: ImageSort, row: &ImageListRow) -> Result<String, ApiError> {
    let cursor = match sort {
        ImageSort::Newest | ImageSort::Oldest => ImageListCursor {
            id: row.id,
            imported_at: Some(row.imported_at),
            filename: None,
        },
        ImageSort::FilenameAsc | ImageSort::FilenameDesc => ImageListCursor {
            id: row.id,
            imported_at: None,
            filename: Some(row.sort_filename.clone()),
        },
    };

    serde_json::to_string(&cursor).map_err(|error| ApiError::internal(error.into()))
}

async fn suggest_tags(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<TagSuggestQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let _user = require_user(&state, &jar).await?;
    let _ = query;

    Ok(Json(json!({
        "items": []
    })))
}

async fn add_favorite(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
) -> Result<Response, ApiError> {
    let user = require_user(&state, &jar).await?;

    sqlx::query(
        "INSERT INTO favorites (user_id, image_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
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
            rating: String::from("safe"),
            file_size: 1024,
            is_favorite: false,
            tags: vec![String::from("artist:umi")],
            imported_at: time::OffsetDateTime::from_unix_timestamp(1_717_312_000).unwrap(),
            sort_filename: String::from("cover.jpg"),
        };

        let encoded = encode_image_cursor(ImageSort::FilenameAsc, &row).unwrap();
        let decoded = decode_image_cursor(&encoded).unwrap();

        assert_eq!(decoded.id, row.id);
        assert_eq!(decoded.filename.as_deref(), Some("cover.jpg"));
        assert!(decoded.imported_at.is_none());
    }
}
