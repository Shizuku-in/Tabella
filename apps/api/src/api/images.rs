//! Gallery endpoints: image CRUD, favorites, tags, stats.
//!
//! # Keyset (cursor) pagination
//!
//! [`list_images`] uses an opaque JSON cursor instead of offset/limit.
//! The cursor embeds the row's sort key — changing `push_image_sort_order`
//! requires matching changes in `push_image_cursor_filter` / `encode_image_cursor`.
//!
//! # Tag filtering
//!
//! `include_tags` / `exclude_tags` are AND filters: an image must have ALL
//! included tags and NONE of the excluded tags.
//!
//! # Rating default
//!
//! When neither `rating` nor `max_rating` is supplied the ceiling is `safe`
//! (see [`allowed_ratings`]).

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
        DownloadQuality, ImageListItem, ImageSort, ListImagesQuery, ListImagesResponse,
        ListTagsQuery, RandomImageQuery, RandomImageResponse, Rating, RatingCounts, StatsResponse,
        TagSuggestQuery, UpdateImageRequest,
    },
    tags::parse_tag,
};

use super::{
    error::ApiError,
    guards::{require_editor, require_user},
};

/// Registers image, tag, stats, and favorite routes under `/api/`.
pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/images", get(list_images))
        .route("/api/images/random", get(random_image))
        .route(
            "/api/images/{image_id}",
            get(get_image).patch(update_image).delete(delete_image),
        )
        .route("/api/tags", get(list_tags))
        .route("/api/tags/suggest", get(suggest_tags))
        .route("/api/stats", get(stats))
        .route(
            "/api/favorites/{image_id}",
            post(add_favorite).delete(remove_favorite),
        )
        .with_state(state)
}

/// Raw query row for `list_images` / `get_image`, includes uploaded user join
/// and a computed `is_favorite` flag scoped to the calling user.
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

/// Opaque pagination token. Fields vary by sort mode — the encoder only
/// populates the subset that the decoder expects for the same sort.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct ImageListCursor {
    id: i64,
    imported_at: Option<time::OffsetDateTime>,
    filename: Option<String>,
    hash: Option<String>,
    seed: Option<i32>,
}

/// Paginated image list with keyset cursors. Supports filtering by rating,
/// tags (AND semantics), favorites, upload date, dimensions, and aspect ratio.
///
/// Returns one more row than `limit`; the extra row's cursor becomes `next_cursor`.
/// A missing or `null` `next_cursor` signals the last page.
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
    let effective_seed = cursor
        .as_ref()
        .and_then(|c| c.seed)
        .or(query.seed)
        .unwrap_or(0);
    let mut builder = sqlx::QueryBuilder::new(
        "SELECT i.id, i.original_filename, i.thumbnail_path, i.preview_path, i.original_path, \
         i.width, i.height, i.sha256, i.source_url, i.note, i.rating, i.file_size, i.imported_at, lower(i.original_filename) AS sort_filename, \
         md5(i.id::text || ",
    );
    builder.push_bind(effective_seed.to_string());
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
            .map(|row| encode_image_cursor(query.sort, row, query.seed))
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

/// Trims and lowercases a tag filter value, returning `None` for empty input.
fn normalize_tag_filter(tag: &str) -> Option<String> {
    let normalized = tag.trim().to_lowercase();
    (!normalized.is_empty()).then_some(normalized)
}

/// Single-image detail by ID, including `is_favorite` and `tags` for the
/// calling user.
///
/// Returns `image_not_found` when the ID doesn't exist.
async fn get_image(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
) -> Result<Json<ImageListItem>, ApiError> {
    let user = require_user(&state, &jar).await?;

    let mut builder = sqlx::QueryBuilder::new(
        "SELECT i.id, i.original_filename, i.thumbnail_path, i.preview_path, i.original_path, \
         i.width, i.height, i.sha256, i.source_url, i.note, i.rating, i.file_size, i.imported_at, \
         lower(i.original_filename) AS sort_filename, \
         NULL::text AS sort_hash, \
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
         WHERE i.id = ",
    );
    builder.push_bind(image_id);

    let row: Option<ImageListRow> = builder
        .build_query_as()
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let row = row.ok_or_else(|| {
        ApiError::not_found(crate::api::error_codes::IMAGE_NOT_FOUND, "Image not found.")
    })?;

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

    Ok(Json(ImageListItem {
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
    }))
}

/// Row for a `random()`-ordered single-image query.
#[derive(Debug, Clone, sqlx::FromRow)]
struct RandomImageRow {
    id: i64,
    original_filename: String,
    thumbnail_path: String,
    preview_path: String,
    original_path: String,
    width: i32,
    height: i32,
    rating: String,
    tags: Vec<String>,
}

/// Resolves the set of ratings an image may have, given an optional exact
/// `rating` set and an optional inclusive `max_rating` ceiling. Both filters
/// are ANDed: the base set (the explicit `rating` list, or all ratings when
/// empty) is then trimmed to those at or below `max_rating`. An empty result
/// means the filters are mutually exclusive and nothing can match.
///
/// When neither filter is supplied the ceiling defaults to `Safe`, so the
/// endpoint is safe-by-default without silently capping an explicit `rating`.
fn allowed_ratings(rating: &[Rating], max_rating: Option<Rating>) -> Vec<Rating> {
    // Apply safe ceiling only when the caller specified nothing at all.
    let effective_max = if rating.is_empty() && max_rating.is_none() {
        Some(Rating::Safe)
    } else {
        max_rating
    };

    let base = if rating.is_empty() {
        vec![Rating::Safe, Rating::Suggestive, Rating::Explicit]
    } else {
        rating.to_vec()
    };

    match effective_max {
        Some(max) => base
            .into_iter()
            .filter(|r| r.level() <= max.level())
            .collect(),
        None => base,
    }
}

/// Picks the media URL for the requested quality, falling back to the sample
/// when the original was not retained on disk (`original_path` empty).
fn random_image_url(row: &RandomImageRow, quality: &DownloadQuality) -> String {
    let relative = match quality {
        DownloadQuality::Thumbnail => &row.thumbnail_path,
        DownloadQuality::Sample => &row.preview_path,
        DownloadQuality::Original => {
            if row.original_path.is_empty() {
                &row.preview_path
            } else {
                &row.original_path
            }
        }
    };

    format!("/media/{relative}")
}

/// Returns one randomly-selected image. Safe-by-default when no rating filter
/// is supplied (see [`allowed_ratings`]).
///
/// Supports the same filter set as [`list_images`] for tags (`include_tags` /
/// `exclude_tags`) and favorites (`favorites_only`), which are ANDed with the
/// rating constraints.
///
/// Uses `ORDER BY random()` — acceptable for small private libraries but a
/// known limitation at scale.
async fn random_image(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<RandomImageQuery>,
) -> Result<Json<RandomImageResponse>, ApiError> {
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

    let allowed = allowed_ratings(&query.rating, query.max_rating);
    if allowed.is_empty() {
        return Err(ApiError::not_found(
            crate::api::error_codes::IMAGE_NOT_FOUND,
            "No image matches the requested rating filters.",
        ));
    }

    // `ORDER BY random()` scans and sorts the whole filtered set. That is fine
    // for the small, private libraries Tabella targets and keeps the query
    // trivial; revisit if galleries ever grow large.
    let mut builder = sqlx::QueryBuilder::new(
        "SELECT i.id, i.original_filename, i.thumbnail_path, i.preview_path, i.original_path, \
         i.width, i.height, i.rating, \
         COALESCE(ARRAY( \
             SELECT CASE WHEN t.namespace = '' THEN t.name ELSE t.namespace || ':' || t.name END \
             FROM image_tags it \
             JOIN tags t ON t.id = it.tag_id \
             WHERE it.image_id = i.id \
             ORDER BY t.namespace, t.name \
         ), '{}') AS tags \
         FROM images i \
         WHERE i.rating = ANY(",
    );
    let ratings: Vec<&str> = allowed.iter().map(|rating| rating.as_str()).collect();
    builder.push_bind(ratings);
    builder.push(") ");

    if query.favorites_only {
        builder
            .push("AND EXISTS (SELECT 1 FROM favorites f WHERE f.image_id = i.id AND f.user_id = ");
        builder.push_bind(user.id);
        builder.push(") ");
    }

    for tag in &include_tags {
        let (namespace, name) = match tag.find(':') {
            Some(pos) => (Some(&tag[..pos]), &tag[pos + 1..]),
            None => (None, tag.as_str()),
        };

        builder.push(
            "AND EXISTS ( \
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
            "AND NOT EXISTS ( \
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

    builder.push("ORDER BY random() LIMIT 1");

    let row: Option<RandomImageRow> = builder
        .build_query_as()
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let row = row.ok_or_else(|| {
        ApiError::not_found(
            crate::api::error_codes::IMAGE_NOT_FOUND,
            "No image matches the requested rating filters.",
        )
    })?;

    let rating = match row.rating.as_str() {
        "suggestive" => Rating::Suggestive,
        "explicit" => Rating::Explicit,
        _ => Rating::Safe,
    };
    let url = random_image_url(&row, &query.quality);

    Ok(Json(RandomImageResponse {
        id: row.id,
        url,
        quality: query.quality,
        width: row.width as u32,
        height: row.height as u32,
        rating,
        original_filename: row.original_filename,
        tags: row.tags,
    }))
}

/// Decodes a JSON cursor string. Returns an `invalid_cursor` error on
/// malformed input.
fn decode_image_cursor(raw: &str) -> Result<ImageListCursor, ApiError> {
    serde_json::from_str(raw).map_err(|_| {
        ApiError::bad_request(
            crate::api::error_codes::INVALID_CURSOR,
            "Invalid image pagination cursor.",
        )
    })
}

/// Pushes a `WHERE` clause that continues a keyset-paginated scan after the
/// last-seen row. The comparison operator and columns depend on the sort direction.
fn push_image_cursor_filter(
    builder: &mut sqlx::QueryBuilder<sqlx::Postgres>,
    sort: ImageSort,
    cursor: &ImageListCursor,
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
            let cursor_seed = cursor.seed.unwrap_or(0);
            builder.push(" AND (md5(i.id::text || ");
            builder.push_bind(cursor_seed.to_string());
            builder.push("), i.id) < (");
            builder.push_bind(hash.clone());
            builder.push(", ");
            builder.push_bind(cursor.id);
            builder.push(") ");
        }
    }

    Ok(())
}

/// Appends an `ORDER BY` clause for the requested sort mode, with `i.id` as
/// the deterministic tiebreaker.
fn push_image_sort_order(builder: &mut sqlx::QueryBuilder<sqlx::Postgres>, sort: ImageSort) {
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

/// Encodes the last-seen row into an opaque JSON cursor. Only the fields
/// relevant to the current sort mode are serialized.
fn encode_image_cursor(
    sort: ImageSort,
    row: &ImageListRow,
    seed: Option<i32>,
) -> Result<String, ApiError> {
    let cursor = match sort {
        ImageSort::Newest | ImageSort::Oldest => ImageListCursor {
            id: row.id,
            imported_at: Some(row.imported_at),
            filename: None,
            hash: None,
            seed: None,
        },
        ImageSort::FilenameAsc | ImageSort::FilenameDesc => ImageListCursor {
            id: row.id,
            imported_at: None,
            filename: Some(row.sort_filename.clone()),
            hash: None,
            seed: None,
        },
        ImageSort::Random => ImageListCursor {
            id: row.id,
            imported_at: None,
            filename: None,
            hash: row.sort_hash.clone(),
            seed,
        },
    };

    serde_json::to_string(&cursor).map_err(|error| ApiError::internal(error.into()))
}

/// Updates rating, note, source_url, and/or tags. All fields optional.
///
/// Tag updates run in a transaction: old tag associations are dropped, new ones
/// inserted, and orphaned tags are pruned. `note` / `source_url` use
/// `Some("")` to clear the field and `None` (or absent) to leave unchanged.
async fn update_image(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
    Json(body): Json<UpdateImageRequest>,
) -> Result<Response, ApiError> {
    let _user = require_editor(&state, &jar).await?;

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    // Consolidated scalar updates (rating, note, source_url) in one query
    // inside the same transaction as tags for atomicity.
    let has_scalar_updates =
        body.rating.is_some() || body.note.is_some() || body.source_url.is_some();
    if has_scalar_updates {
        let mut builder = sqlx::QueryBuilder::new("UPDATE images SET updated_at = now()");
        if let Some(ref rating) = body.rating {
            builder.push(", rating = ");
            builder.push_bind(rating.as_str());
        }
        if let Some(ref note) = body.note {
            builder.push(", note = ");
            builder.push_bind(note.as_str());
        }
        if let Some(ref source_url) = body.source_url {
            builder.push(", source_url = ");
            builder.push_bind(source_url.as_str());
        }
        builder.push(" WHERE id = ");
        builder.push_bind(image_id);
        builder
            .build()
            .execute(&mut *tx)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;
    }

    if let Some(tags) = &body.tags {
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

        let parsed_tags: Vec<_> = tags.iter().filter_map(|s| parse_tag(s)).collect();

        crate::tags::bulk_attach_tags_to_image(&mut tx, image_id, &parsed_tags)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;

        crate::tags::cleanup_orphan_tags(&mut tx, &previous_tag_ids)
            .await
            .map_err(|e| ApiError::internal(e.into()))?;
    }

    tx.commit()
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    Ok(StatusCode::NO_CONTENT.into_response())
}

/// On-disk paths for the three derivatives of a single image. Used during
/// deletion to locate the files to remove.
#[derive(Debug, Clone, sqlx::FromRow)]
struct ImageFileRow {
    original_path: String,
    preview_path: String,
    thumbnail_path: String,
}

/// Permanently deletes an image: DB row in a transaction with orphan-tag
/// cleanup, then media files on disk (best-effort — missing files are logged
/// but not fatal).
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

/// Autocomplete tag names by case-insensitive prefix search.
/// Results are cached for 60 seconds — tag changes are infrequent.
async fn suggest_tags(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<TagSuggestQuery>,
) -> Result<Response, ApiError> {
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

    let mut response = Json(json!({
        "items": items
    }))
    .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        "private, max-age=60".parse().unwrap(),
    );
    Ok(response)
}

/// Lists tags with per-tag image counts, sorted by frequency descending.
/// Optionally filtered to a single namespace.
/// Results are cached for 30 seconds — count changes are infrequent.
async fn list_tags(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<ListTagsQuery>,
) -> Result<Response, ApiError> {
    let _user = require_user(&state, &jar).await?;

    let limit = query.limit.unwrap_or(100).clamp(1, 500) as i64;

    let mut builder = sqlx::QueryBuilder::new(
        "SELECT CASE WHEN t.namespace = '' THEN t.name ELSE t.namespace || ':' || t.name END AS tag, \
         COUNT(it.image_id)::bigint AS count \
         FROM tags t \
         LEFT JOIN image_tags it ON it.tag_id = t.id ",
    );

    if let Some(ns) = &query.namespace {
        builder.push("WHERE t.namespace = ");
        builder.push_bind(ns.to_lowercase());
    }

    builder.push(
        " GROUP BY t.id, t.namespace, t.name ORDER BY count DESC, t.namespace, t.name LIMIT ",
    );
    builder.push_bind(limit);

    #[derive(sqlx::FromRow)]
    struct TagRow {
        tag: String,
        count: i64,
    }

    let rows: Vec<TagRow> = builder
        .build_query_as()
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let items: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| json!({ "tag": r.tag, "count": r.count }))
        .collect();

    let mut response = Json(json!({ "items": items })).into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        "private, max-age=30".parse().unwrap(),
    );
    Ok(response)
}

/// Gallery summary: total images, tags (attached to ≥1 image), storage bytes,
/// and per-rating counts. Results are cached for 10 seconds because stats
/// naturally lag behind concurrent imports.
async fn stats(State(state): State<AppState>, jar: CookieJar) -> Result<Response, ApiError> {
    let _user = require_user(&state, &jar).await?;

    #[derive(sqlx::FromRow)]
    struct StatsRow {
        total_images: i64,
        total_tags: i64,
        total_size_bytes: i64,
        safe_count: i64,
        suggestive_count: i64,
        explicit_count: i64,
    }

    let row: StatsRow = sqlx::query_as(
        r#"
        SELECT
            COUNT(*)::bigint AS total_images,
            COALESCE((SELECT COUNT(DISTINCT tag_id) FROM image_tags), 0)::bigint AS total_tags,
            COALESCE(SUM(file_size), 0)::bigint AS total_size_bytes,
            COALESCE(SUM(CASE WHEN rating = 'safe' THEN 1 ELSE 0 END), 0)::bigint AS safe_count,
            COALESCE(SUM(CASE WHEN rating = 'suggestive' THEN 1 ELSE 0 END), 0)::bigint AS suggestive_count,
            COALESCE(SUM(CASE WHEN rating = 'explicit' THEN 1 ELSE 0 END), 0)::bigint AS explicit_count
        FROM images
        "#,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let mut response = Json(StatsResponse {
        total_images: row.total_images,
        total_tags: row.total_tags,
        total_size_bytes: row.total_size_bytes,
        rating_counts: RatingCounts {
            safe: row.safe_count,
            suggestive: row.suggestive_count,
            explicit: row.explicit_count,
        },
    })
    .into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        "private, max-age=10".parse().unwrap(),
    );
    Ok(response)
}

/// Adds an image to the caller's favorites. Idempotent (`ON CONFLICT DO NOTHING`).
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

/// Removes an image from the caller's favorites. Idempotent.
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
    use super::{
        ImageListRow, RandomImageRow, allowed_ratings, decode_image_cursor, encode_image_cursor,
        random_image_url,
    };
    use crate::dto::{DownloadQuality, ImageSort, Rating};

    fn random_row(original_path: &str) -> RandomImageRow {
        RandomImageRow {
            id: 7,
            original_filename: String::from("cover.jpg"),
            thumbnail_path: String::from("thumbnails/hash.webp"),
            preview_path: String::from("samples/hash.webp"),
            original_path: String::from(original_path),
            width: 800,
            height: 600,
            rating: String::from("safe"),
            tags: vec![],
        }
    }

    #[test]
    fn allowed_ratings_defaults_to_safe_when_unfiltered() {
        // Neither rating nor max_rating specified → safe-by-default.
        let allowed = allowed_ratings(&[], None);
        assert_eq!(allowed, vec![Rating::Safe]);
    }

    #[test]
    fn allowed_ratings_honors_exact_set() {
        let allowed = allowed_ratings(&[Rating::Safe, Rating::Explicit], None);
        assert_eq!(allowed, vec![Rating::Safe, Rating::Explicit]);
    }

    #[test]
    fn allowed_ratings_applies_max_ceiling() {
        let allowed = allowed_ratings(&[], Some(Rating::Suggestive));
        assert_eq!(allowed, vec![Rating::Safe, Rating::Suggestive]);
    }

    #[test]
    fn allowed_ratings_intersects_exact_set_and_ceiling() {
        let allowed = allowed_ratings(&[Rating::Safe, Rating::Explicit], Some(Rating::Suggestive));
        assert_eq!(allowed, vec![Rating::Safe]);
    }

    #[test]
    fn allowed_ratings_is_empty_when_filters_conflict() {
        let allowed = allowed_ratings(&[Rating::Explicit], Some(Rating::Safe));
        assert!(allowed.is_empty());
    }

    #[test]
    fn random_image_url_selects_by_quality() {
        let row = random_row("originals/cover.jpg");
        assert_eq!(
            random_image_url(&row, &DownloadQuality::Thumbnail),
            "/media/thumbnails/hash.webp"
        );
        assert_eq!(
            random_image_url(&row, &DownloadQuality::Sample),
            "/media/samples/hash.webp"
        );
        assert_eq!(
            random_image_url(&row, &DownloadQuality::Original),
            "/media/originals/cover.jpg"
        );
    }

    #[test]
    fn random_image_url_falls_back_to_sample_without_original() {
        let row = random_row("");
        assert_eq!(
            random_image_url(&row, &DownloadQuality::Original),
            "/media/samples/hash.webp"
        );
    }

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

        let encoded = encode_image_cursor(ImageSort::FilenameAsc, &row, None).unwrap();
        let decoded = decode_image_cursor(&encoded).unwrap();

        assert_eq!(decoded.id, row.id);
        assert_eq!(decoded.filename.as_deref(), Some("cover.jpg"));
        assert!(decoded.imported_at.is_none());
        assert!(decoded.seed.is_none());
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

        let encoded = encode_image_cursor(ImageSort::Random, &row, Some(42)).unwrap();
        let decoded = decode_image_cursor(&encoded).unwrap();

        assert_eq!(decoded.id, row.id);
        assert_eq!(decoded.hash.as_deref(), Some("randomhash123"));
        assert_eq!(decoded.seed, Some(42));
    }
}
