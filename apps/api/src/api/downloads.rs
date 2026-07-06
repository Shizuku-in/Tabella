//! Download archive lifecycle: create → background zip → poll → stream.
//! Archives use uncompressed (stored) zip entries; files are streamed with
//! `Content-Disposition: attachment`.

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use serde::Serialize;
use serde_json::{Value, json};
use time::OffsetDateTime;
use tokio_util::io::ReaderStream;
use tracing::error;
use uuid::Uuid;

use crate::{
    AppState,
    dto::{DownloadJobRequest, DownloadQuality},
    tasks::archive::{ArchiveTask, process_archive_job},
};

use super::{error::ApiError, guards::require_user};

/// Registers `/api/download-jobs` routes.
pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/download-jobs", post(create_download_job))
        .route("/api/download-jobs/{job_id}", get(get_download_job))
        .route("/api/download-jobs/{job_id}/file", get(download_job_file))
        .with_state(state)
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct DownloadImageRow {
    original_path: String,
    preview_path: String,
    thumbnail_path: String,
    original_filename: String,
}

#[derive(sqlx::FromRow)]
struct DownloadJobRow {
    id: Uuid,
    user_id: i64,
    status: Option<String>,
    total_images: i32,
    total_bytes: i64,
    error_message: Option<String>,
    error_code: Option<String>,
    error_params: Option<Value>,
}

#[derive(sqlx::FromRow)]
struct DownloadJobFileRow {
    user_id: i64,
    status: Option<String>,
    file_path: Option<String>,
}

/// API response for download job creation and status polling.
#[derive(Serialize)]
pub(crate) struct DownloadJobResponse {
    pub id: Uuid,
    pub status: String,
    pub total_images: i32,
    pub total_bytes: i64,
    pub error_message: Option<String>,
    pub error_code: Option<String>,
    pub error_params: Option<Value>,
}

/// Validates image IDs, checks limits (count + total bytes), inserts a
/// `pending` job, and spawns a background archiving task.
async fn create_download_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<DownloadJobRequest>,
) -> Result<Json<DownloadJobResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;
    let settings = state.dynamic_config().await;

    if request.image_ids.is_empty() {
        return Err(ApiError::bad_request(
            crate::api::error_codes::NO_IMAGES_SELECTED,
            "No images selected",
        ));
    }

    if request.image_ids.len() > settings.max_download_images {
        return Err(ApiError::bad_request_with_params(
            crate::api::error_codes::TOO_MANY_IMAGES_REQUESTED,
            format!(
                "Cannot download more than {} images at once.",
                settings.max_download_images
            ),
            json!({ "max_images": settings.max_download_images }),
        ));
    }

    // Query images from DB to get their sizes and paths
    let query_ids = request.image_ids;
    let records: Vec<DownloadImageRow> = sqlx::query_as(
        r#"
        SELECT original_path, preview_path, thumbnail_path, original_filename
        FROM images
        WHERE id = ANY($1)
        "#,
    )
    .bind(&query_ids)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    if records.len() != query_ids.len() {
        return Err(ApiError::bad_request(
            crate::api::error_codes::SELECTED_IMAGES_NOT_FOUND,
            "Some or all selected images were not found",
        ));
    }

    let mut total_bytes: i64 = 0;
    let mut image_paths = Vec::new();

    for record in &records {
        let abs_path = download_source_path(&state.config.media_root, record, &request.quality);
        if let Ok(metadata) = tokio::fs::metadata(&abs_path).await {
            total_bytes += metadata.len() as i64;
        }
        image_paths.push((
            abs_path.to_string_lossy().to_string(),
            archive_filename(record, &request.quality),
        ));
    }

    if total_bytes as u64 > settings.max_download_total_bytes {
        return Err(ApiError::bad_request_with_params(
            crate::api::error_codes::DOWNLOAD_SIZE_LIMIT_EXCEEDED,
            format!(
                "Total size exceeds the maximum limit of {} bytes.",
                settings.max_download_total_bytes
            ),
            json!({ "max_total_bytes": settings.max_download_total_bytes }),
        ));
    }

    let job_id = Uuid::new_v4();
    let expires_at =
        OffsetDateTime::now_utc() + time::Duration::hours(settings.download_retention_hours as i64);

    sqlx::query(
        r#"
        INSERT INTO download_jobs (id, user_id, status, total_images, total_bytes, expires_at)
        VALUES ($1, $2, 'pending', $3, $4, $5)
        "#,
    )
    .bind(job_id)
    .bind(user.id)
    .bind(records.len() as i32)
    .bind(total_bytes)
    .bind(expires_at)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    // Spawn the background archiving job
    let task = ArchiveTask {
        job_id,
        image_paths,
        download_root: state.config.temp_root.clone(),
    };
    tokio::spawn(process_archive_job(state.clone(), task));

    Ok(Json(DownloadJobResponse {
        id: job_id,
        status: "pending".to_string(),
        total_images: records.len() as i32,
        total_bytes,
        error_message: None,
        error_code: None,
        error_params: None,
    }))
}

/// Resolves the on-disk path for a derivative, joining the media root with
/// the stored relative path for the requested quality.
fn download_source_path(
    media_root: &std::path::Path,
    record: &DownloadImageRow,
    quality: &DownloadQuality,
) -> std::path::PathBuf {
    let relative_path = match quality {
        DownloadQuality::Thumbnail => &record.thumbnail_path,
        DownloadQuality::Sample => &record.preview_path,
        DownloadQuality::Original => &record.original_path,
    };

    media_root.join(relative_path)
}

fn archive_filename(record: &DownloadImageRow, quality: &DownloadQuality) -> String {
    match quality {
        DownloadQuality::Original => record.original_filename.clone(),
        DownloadQuality::Thumbnail => {
            derived_archive_filename(&record.original_filename, "_thumb", &record.thumbnail_path)
        }
        DownloadQuality::Sample => {
            derived_archive_filename(&record.original_filename, "_sample", &record.preview_path)
        }
    }
}

fn derived_archive_filename(original_filename: &str, suffix: &str, stored_path: &str) -> String {
    let original_path = std::path::Path::new(original_filename);
    let stem = original_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("image");
    let extension = std::path::Path::new(stored_path)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("bin");

    format!("{stem}{suffix}.{extension}")
}

/// Polls job status. Owner-only: returns `download_job_access_denied` for
/// other users.
async fn get_download_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Json<DownloadJobResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;

    let record: Option<DownloadJobRow> = sqlx::query_as(
        r#"
        SELECT id, user_id, status::TEXT as status, total_images, total_bytes, error_message, error_code, error_params
        FROM download_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let record = record.ok_or_else(|| {
        ApiError::not_found(
            crate::api::error_codes::DOWNLOAD_JOB_NOT_FOUND,
            "Download job not found",
        )
    })?;

    if record.user_id != user.id {
        return Err(ApiError::forbidden(
            crate::api::error_codes::DOWNLOAD_JOB_ACCESS_DENIED,
            "You can only view your own download jobs",
        ));
    }

    Ok(Json(DownloadJobResponse {
        id: record.id,
        status: record.status.unwrap_or_else(|| "unknown".to_string()),
        total_images: record.total_images,
        total_bytes: record.total_bytes,
        error_message: record.error_message,
        error_code: record.error_code,
        error_params: record.error_params,
    }))
}

/// Streams the completed zip archive. Owner-only, requires `status = completed`.
async fn download_job_file(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let user = require_user(&state, &jar).await?;

    let record: Option<DownloadJobFileRow> = sqlx::query_as(
        r#"
        SELECT user_id, status::TEXT as status, file_path
        FROM download_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let record = record.ok_or_else(|| {
        ApiError::not_found(
            crate::api::error_codes::DOWNLOAD_JOB_NOT_FOUND,
            "Download job not found",
        )
    })?;

    if record.user_id != user.id {
        return Err(ApiError::forbidden(
            crate::api::error_codes::DOWNLOAD_JOB_ACCESS_DENIED,
            "You can only download your own files",
        ));
    }

    if record.status.as_deref() != Some("completed") {
        return Err(ApiError::bad_request(
            crate::api::error_codes::DOWNLOAD_JOB_NOT_COMPLETED,
            "The download job is not completed yet",
        ));
    }

    let file_path = record
        .file_path
        .ok_or_else(|| ApiError::internal(anyhow::anyhow!("File path is missing")))?;
    let abs_path = state.config.temp_root.join(&file_path);

    let file = tokio::fs::File::open(&abs_path).await.map_err(|e| {
        error!(%e, "failed to open download zip file");
        ApiError::not_found(
            crate::api::error_codes::DOWNLOAD_ARCHIVE_MISSING,
            "The archive file no longer exists",
        )
    })?;

    let file_size = file.metadata().await.map(|m| m.len()).ok();

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    let filename = format!("Tabella-Archive-{}.zip", job_id.simple());
    let content_disposition = format!("attachment; filename=\"{}\"", filename);

    let mut response = body.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&content_disposition).map_err(|e| ApiError::internal(e.into()))?,
    );
    if let Some(size) = file_size {
        response.headers_mut().insert(
            header::CONTENT_LENGTH,
            HeaderValue::from_str(&size.to_string()).map_err(|e| ApiError::internal(e.into()))?,
        );
    }

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::{DownloadImageRow, archive_filename, derived_archive_filename};
    use crate::dto::DownloadQuality;

    #[test]
    fn derived_archive_filename_uses_original_stem_and_stored_extension() {
        assert_eq!(
            derived_archive_filename("cover.jpg", "_sample", "samples/hash.webp"),
            "cover_sample.webp"
        );
    }

    #[test]
    fn archive_filename_keeps_original_name_for_original_quality() {
        let row = DownloadImageRow {
            original_path: String::from("originals/cover.jpg"),
            preview_path: String::from("samples/hash.webp"),
            thumbnail_path: String::from("thumbnails/hash.webp"),
            original_filename: String::from("cover.jpg"),
        };

        assert_eq!(
            archive_filename(&row, &DownloadQuality::Original),
            "cover.jpg"
        );
        assert_eq!(
            archive_filename(&row, &DownloadQuality::Sample),
            "cover_sample.webp"
        );
        assert_eq!(
            archive_filename(&row, &DownloadQuality::Thumbnail),
            "cover_thumb.webp"
        );
    }
}
