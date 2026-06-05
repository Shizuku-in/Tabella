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
use time::OffsetDateTime;
use tokio_util::io::ReaderStream;
use tracing::error;
use uuid::Uuid;

use crate::{
    AppState,
    config::DynamicConfig,
    dto::{DownloadJobRequest, DownloadQuality},
    tasks::archive::{ArchiveTask, process_archive_job},
};

use super::{error::ApiError, guards::require_user};

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

#[derive(Serialize)]
pub(crate) struct DownloadJobResponse {
    pub id: Uuid,
    pub status: String,
    pub total_images: i32,
    pub total_bytes: i64,
    pub error_message: Option<String>,
}

async fn create_download_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<DownloadJobRequest>,
) -> Result<Json<DownloadJobResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;
    let settings = DynamicConfig::load(&state.pool, &state.config).await;

    if request.image_ids.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_request",
            "No images selected",
        ));
    }

    if request.image_ids.len() > settings.max_download_images {
        return Err(ApiError::bad_request(
            "limit_exceeded",
            format!(
                "Cannot download more than {} images at once.",
                settings.max_download_images
            ),
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

    if records.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_request",
            "Selected images not found",
        ));
    }

    let mut total_bytes: i64 = 0;
    let mut image_paths = Vec::new();

    for record in &records {
        let abs_path = download_source_path(&state.config.media_root, record, &request.quality);
        if let Ok(metadata) = std::fs::metadata(&abs_path) {
            total_bytes += metadata.len() as i64;
        }
        image_paths.push((
            abs_path.to_string_lossy().to_string(),
            archive_filename(record, &request.quality),
        ));
    }

    if total_bytes as u64 > settings.max_download_total_bytes {
        return Err(ApiError::bad_request(
            "limit_exceeded",
            format!(
                "Total size exceeds the maximum limit of {} bytes.",
                settings.max_download_total_bytes
            ),
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
        media_root: state.config.media_root.clone(),
    };
    tokio::spawn(process_archive_job(state.clone(), task));

    Ok(Json(DownloadJobResponse {
        id: job_id,
        status: "pending".to_string(),
        total_images: records.len() as i32,
        total_bytes,
        error_message: None,
    }))
}

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

async fn get_download_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Json<DownloadJobResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;

    let record = sqlx::query(
        r#"
        SELECT id, user_id, status::TEXT as status, total_images, total_bytes, error_message
        FROM download_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let record = record.ok_or_else(|| ApiError::not_found("Download job not found"))?;
    let record_user_id: i64 = sqlx::Row::try_get(&record, "user_id").unwrap();

    if record_user_id != user.id {
        return Err(ApiError::unauthorized(
            "unauthorized",
            "You can only view your own download jobs",
        ));
    }

    Ok(Json(DownloadJobResponse {
        id: sqlx::Row::try_get(&record, "id").unwrap(),
        status: sqlx::Row::try_get::<Option<String>, _>(&record, "status")
            .unwrap()
            .unwrap_or_else(|| "unknown".to_string()),
        total_images: sqlx::Row::try_get(&record, "total_images").unwrap(),
        total_bytes: sqlx::Row::try_get(&record, "total_bytes").unwrap(),
        error_message: sqlx::Row::try_get(&record, "error_message").unwrap(),
    }))
}

async fn download_job_file(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let user = require_user(&state, &jar).await?;

    let record = sqlx::query(
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

    let record = record.ok_or_else(|| ApiError::not_found("Download job not found"))?;
    let record_user_id: i64 = sqlx::Row::try_get(&record, "user_id").unwrap();

    if record_user_id != user.id {
        return Err(ApiError::unauthorized(
            "unauthorized",
            "You can only download your own files",
        ));
    }

    let record_status: Option<String> = sqlx::Row::try_get(&record, "status").unwrap();
    if record_status.as_deref() != Some("completed") {
        return Err(ApiError::bad_request(
            "invalid_state",
            "The download job is not completed yet",
        ));
    }

    let file_path: Option<String> = sqlx::Row::try_get(&record, "file_path").unwrap();
    let file_path =
        file_path.ok_or_else(|| ApiError::internal(anyhow::anyhow!("File path is missing")))?;
    let abs_path = state.config.media_root.join(&file_path);

    let file = tokio::fs::File::open(&abs_path).await.map_err(|e| {
        error!(%e, "Failed to open download zip file");
        ApiError::not_found("The archive file no longer exists")
    })?;

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
        HeaderValue::from_str(&content_disposition).unwrap(),
    );

    Ok(response)
}
