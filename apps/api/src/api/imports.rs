use std::path::{Component, Path as StdPath, PathBuf};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use serde_json::json;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::AppState;

use super::{
    error::ApiError,
    guards::{require_admin, require_editor},
};

const MAX_ADMIN_UPLOAD_BYTES: usize = 1_024 * 1_024 * 1_024;

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route(
            "/api/admin/imports",
            get(list_import_jobs).post(create_import_job),
        )
        .route(
            "/api/admin/imports/upload",
            post(upload_import_files).layer(DefaultBodyLimit::max(MAX_ADMIN_UPLOAD_BYTES)),
        )
        .route("/api/admin/imports/{job_id}", get(get_import_job))
        .with_state(state)
}

#[derive(serde::Deserialize)]
pub(crate) struct CreateImportRequest {
    pub(crate) source_path: String,
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct JobStatusRow {
    id: uuid::Uuid,
    status: String,
    total_items: i32,
    processed_items: i32,
    succeeded_items: i32,
    failed_items: i32,
    created_at: time::OffsetDateTime,
    finished_at: Option<time::OffsetDateTime>,
    last_error: Option<String>,
    error_code: Option<String>,
    error_params: Option<serde_json::Value>,
}

#[derive(serde::Deserialize)]
pub(crate) struct UploadQuery {
    #[serde(rename = "type")]
    source_type: Option<String>,
}

async fn create_import_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<CreateImportRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = require_admin(&state, &jar).await?;

    let job_id = uuid::Uuid::new_v4();
    let source_filename = std::path::Path::new(&request.source_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();

    sqlx::query(
        r#"
        INSERT INTO import_jobs (id, created_by_user_id, source_filename, source_archive_path, status)
        VALUES ($1, $2, $3, $4, 'queued')
        "#,
    )
    .bind(job_id)
    .bind(admin.id)
    .bind(source_filename)
    .bind(request.source_path)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    Ok(Json(serde_json::json!({
        "id": job_id,
        "status": "queued",
    })))
}

async fn get_import_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let _user = require_editor(&state, &jar).await?;

    let job: Option<JobStatusRow> = sqlx::query_as(
        r#"
        SELECT id, status, total_items, processed_items, succeeded_items, failed_items, created_at, finished_at, last_error, error_code, error_params
        FROM import_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let job =
        job.ok_or_else(|| ApiError::not_found("import_job_not_found", "Import job not found"))?;

    Ok(Json(serde_json::json!({
        "id": job.id,
        "status": job.status,
        "total_items": job.total_items,
        "processed_items": job.processed_items,
        "succeeded_items": job.succeeded_items,
        "failed_items": job.failed_items,
        "created_at": job.created_at,
        "finished_at": job.finished_at,
        "last_error": job.last_error,
        "error_code": job.error_code,
        "error_params": job.error_params,
    })))
}

async fn list_import_jobs(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<serde_json::Value>, ApiError> {
    let _user = require_editor(&state, &jar).await?;

    let limit = 50i64;
    let rows = sqlx::query(
        r#"
        SELECT id, status, source_type, total_items, processed_items, succeeded_items, failed_items, created_at, last_error, error_code, error_params
        FROM import_jobs
        ORDER BY created_at DESC
        LIMIT $1
        "#,
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    use sqlx::Row;
    let mut items = Vec::new();
    for row in rows {
        items.push(json!({
            "id": row.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
            "status": row.try_get::<String, _>("status").unwrap_or_default(),
            "sourceType": row.try_get::<String, _>("source_type").unwrap_or_else(|_| "server".to_string()),
            "totalItems": row.try_get::<i32, _>("total_items").unwrap_or_default(),
            "processedItems": row.try_get::<i32, _>("processed_items").unwrap_or_default(),
            "succeededItems": row.try_get::<i32, _>("succeeded_items").unwrap_or_default(),
            "failedItems": row.try_get::<i32, _>("failed_items").unwrap_or_default(),
            "lastError": row.try_get::<Option<String>, _>("last_error").unwrap_or(None),
            "errorCode": row.try_get::<Option<String>, _>("error_code").unwrap_or(None),
            "errorParams": row.try_get::<Option<serde_json::Value>, _>("error_params").unwrap_or(None),
            "createdAt": row.try_get::<time::OffsetDateTime, _>("created_at")
                .unwrap_or_else(|_| time::OffsetDateTime::now_utc())
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
        }));
    }

    Ok(Json(json!({ "items": items })))
}

async fn upload_import_files(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<UploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user = require_editor(&state, &jar).await?;

    // Create a temp directory for this upload batch
    let batch_id = uuid::Uuid::new_v4();
    let temp_dir = state
        .config
        .media_root
        .join("temp")
        .join(batch_id.to_string());
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let mut has_files = false;
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(api_error_from_multipart)?
    {
        let name = field.name().unwrap_or("unknown_name").to_string();
        let file_name_opt = field.file_name().map(|s| s.to_string());
        tracing::info!(
            "Received field: name={}, file_name={:?}",
            name,
            file_name_opt
        );

        if let Some(file_name) = file_name_opt {
            let relative_path = sanitize_upload_path(&file_name)?;
            let file_path = temp_dir.join(relative_path);
            if let Some(parent) = file_path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| ApiError::internal(e.into()))?;
            }

            let mut output = tokio::fs::File::create(&file_path)
                .await
                .map_err(|e| ApiError::internal(e.into()))?;

            while let Some(chunk) = field.chunk().await.map_err(api_error_from_multipart)? {
                output
                    .write_all(&chunk)
                    .await
                    .map_err(|e| ApiError::internal(e.into()))?;
            }

            output
                .flush()
                .await
                .map_err(|e| ApiError::internal(e.into()))?;
            has_files = true;
        }
    }

    if !has_files {
        return Err(ApiError::bad_request(
            "no_files_uploaded",
            "No files uploaded",
        ));
    }

    let source_type = query.source_type.unwrap_or_else(|| "folder".to_string());

    // Create an import job for this temp directory
    sqlx::query(
        r#"
        INSERT INTO import_jobs (id, created_by_user_id, source_filename, source_archive_path, status, source_type)
        VALUES ($1, $2, $3, $4, 'queued', $5)
        "#,
    )
    .bind(batch_id)
    .bind(user.id)
    .bind("Browser Upload")
    .bind(temp_dir.to_string_lossy().to_string())
    .bind(source_type)
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    Ok(Json(json!({
        "id": batch_id,
        "status": "queued"
    })))
}

fn sanitize_upload_path(file_name: &str) -> Result<PathBuf, ApiError> {
    let mut sanitized = PathBuf::new();

    for component in StdPath::new(file_name).components() {
        match component {
            Component::Normal(part) => sanitized.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(ApiError::bad_request(
                    "invalid_upload_path",
                    "Upload path must stay inside the server staging directory.",
                ));
            }
        }
    }

    if sanitized.as_os_str().is_empty() {
        return Err(ApiError::bad_request(
            "invalid_upload_path",
            "Upload path must include a file name.",
        ));
    }

    Ok(sanitized)
}

fn api_error_from_multipart(error: axum::extract::multipart::MultipartError) -> ApiError {
    match error.status() {
        StatusCode::PAYLOAD_TOO_LARGE => {
            ApiError::payload_too_large("Uploaded payload is too large.")
        }
        StatusCode::BAD_REQUEST => {
            ApiError::bad_request("invalid_multipart", "Uploaded data could not be processed.")
        }
        _ => ApiError::internal(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::sanitize_upload_path;

    #[test]
    fn sanitize_upload_path_keeps_relative_structure() {
        assert_eq!(
            sanitize_upload_path("albums/cover.jpg").unwrap(),
            PathBuf::from("albums").join("cover.jpg"),
        );
    }

    #[test]
    fn sanitize_upload_path_rejects_parent_traversal() {
        assert!(sanitize_upload_path("../escape.jpg").is_err());
    }

    #[test]
    fn sanitize_upload_path_rejects_absolute_paths() {
        assert!(sanitize_upload_path("/escape.jpg").is_err());
    }
}
