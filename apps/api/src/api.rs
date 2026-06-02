use std::path::{Component, Path as StdPath, PathBuf};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use serde_json::json;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::{
    AppState, auth,
    dto::{
        AuthUserResponse, DownloadJobRequest, HealthResponse, ImageListItem, ListImagesQuery,
        ListImagesResponse, LoginRequest, Rating, SessionUser, TagSuggestQuery, UserRole,
    },
};

const MAX_ADMIN_UPLOAD_BYTES: usize = 1_024 * 1_024 * 1_024;

pub(crate) fn router(state: AppState) -> Router {
    let api_routes = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/me", get(get_me))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/images", get(list_images))
        .route("/api/tags/suggest", get(suggest_tags))
        .route(
            "/api/favorites/{image_id}",
            post(add_favorite).delete(remove_favorite),
        )
        .route(
            "/api/admin/imports",
            get(list_import_jobs).post(create_import_job),
        )
        .route(
            "/api/admin/imports/upload",
            post(upload_import_files).layer(DefaultBodyLimit::max(MAX_ADMIN_UPLOAD_BYTES)),
        )
        .route("/api/admin/imports/{job_id}", get(get_import_job))
        .route("/api/download-jobs", post(create_download_job))
        .route("/api/download-jobs/{job_id}", get(get_download_job))
        .route("/api/download-jobs/{job_id}/file", get(download_job_file));

    Router::new().merge(api_routes).with_state(state)
}

async fn healthz(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "tabella-api",
        max_download_images: state.config.max_download_images,
        download_retention_hours: state.config.download_retention_hours,
    })
}

async fn get_me(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<AuthUserResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;
    Ok(Json(AuthUserResponse { user }))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<(CookieJar, Json<AuthUserResponse>), ApiError> {
    let username = request.username.trim();
    let password = request.password.trim();

    if username.is_empty() || password.is_empty() {
        return Err(ApiError::bad_request(
            "missing_credentials",
            "用户名和密码不能为空。",
        ));
    }

    let Some(user) = auth::authenticate(&state.pool, username, password)
        .await
        .context("failed to authenticate request")
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::unauthorized(
            "invalid_credentials",
            "用户名或密码错误。",
        ));
    };

    let user_agent = headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok());
    let (session_id, expires_at) =
        auth::create_session(&state.pool, &state.config, user.id, user_agent)
            .await
            .context("failed to create session")
            .map_err(ApiError::internal)?;

    let jar = jar.add(auth::build_session_cookie(
        &state.config,
        session_id,
        expires_at,
    ));

    Ok((jar, Json(AuthUserResponse { user })))
}

async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<(CookieJar, StatusCode), ApiError> {
    if let Some(session_id) = auth::session_id_from_jar(&jar, &state.config.session_cookie_name) {
        auth::destroy_session(&state.pool, session_id)
            .await
            .context("failed to delete session")
            .map_err(ApiError::internal)?;
    }

    Ok((
        jar.add(auth::build_logout_cookie(&state.config)),
        StatusCode::NO_CONTENT,
    ))
}

async fn list_images(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<ListImagesQuery>,
) -> Result<Json<ListImagesResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;

    let limit = query.limit.unwrap_or(50).clamp(1, 100) as i64;
    let mut builder = sqlx::QueryBuilder::new(
        "SELECT i.id, i.original_filename, i.thumbnail_path, i.preview_path, i.original_path, i.width, i.height, i.rating, i.file_size, \
         (f.image_id IS NOT NULL) AS is_favorite, \
         COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags \
         FROM images i \
         LEFT JOIN favorites f ON f.image_id = i.id AND f.user_id = ",
    );
    builder.push_bind(user.id);
    builder.push(
        " LEFT JOIN image_tags it ON it.image_id = i.id \
                  LEFT JOIN tags t ON t.id = it.tag_id \
                  WHERE 1=1 ",
    );

    if query.favorites_only {
        builder.push(" AND f.image_id IS NOT NULL ");
    }

    if !query.rating.is_empty() {
        builder.push(" AND i.rating = ANY(");
        let ratings: Vec<&str> = query.rating.iter().map(|rating| rating.as_str()).collect();
        builder.push_bind(ratings);
        builder.push(") ");
    }

    if let Some(cursor) = query.cursor {
        if let Ok(id) = cursor.parse::<i64>() {
            builder.push(" AND i.id < ");
            builder.push_bind(id);
        }
    }

    builder.push(" GROUP BY i.id, f.image_id ");
    builder.push(" ORDER BY i.id DESC LIMIT ");
    builder.push_bind(limit + 1);

    let rows: Vec<sqlx::postgres::PgRow> = builder
        .build()
        .fetch_all(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    use sqlx::Row;
    let mut items = Vec::new();
    for row in rows {
        let rating_str: String = row.try_get("rating").unwrap_or_else(|_| "safe".to_string());
        let rating = match rating_str.as_str() {
            "suggestive" => Rating::Suggestive,
            "explicit" => Rating::Explicit,
            _ => Rating::Safe,
        };

        let thumbnail_path: String = row.try_get("thumbnail_path").unwrap_or_default();
        let preview_path: String = row.try_get("preview_path").unwrap_or_default();
        let original_path: String = row.try_get("original_path").unwrap_or_default();

        items.push(ImageListItem {
            id: row.try_get("id").unwrap_or(0),
            original_filename: row.try_get("original_filename").unwrap_or_default(),
            thumbnail_url: format!("/media/{}", thumbnail_path),
            preview_url: format!("/media/{}", preview_path),
            original_url: Some(format!("/media/{}", original_path)),
            width: row.try_get::<i32, _>("width").unwrap_or(0) as u32,
            height: row.try_get::<i32, _>("height").unwrap_or(0) as u32,
            rating,
            is_favorite: row.try_get("is_favorite").unwrap_or(false),
            tags: row.try_get("tags").unwrap_or_default(),
            file_size: row.try_get::<i64, _>("file_size").unwrap_or(0),
        });
    }

    let next_cursor = if items.len() > limit as usize {
        items.pop(); // Remove the extra item
        items.last().map(|item| item.id.to_string())
    } else {
        None
    };

    Ok(Json(ListImagesResponse { items, next_cursor }))
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

#[derive(serde::Deserialize)]
pub(crate) struct CreateImportRequest {
    pub(crate) source_path: String,
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
}

async fn get_import_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let _admin = require_admin(&state, &jar).await?;

    let job: Option<JobStatusRow> = sqlx::query_as(
        r#"
        SELECT id, status, total_items, processed_items, succeeded_items, failed_items, created_at, finished_at, last_error
        FROM import_jobs
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let job = job.ok_or_else(|| ApiError::not_found("Import job not found"))?;

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
    })))
}

async fn create_download_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<DownloadJobRequest>,
) -> Result<Response, ApiError> {
    let _user = require_user(&state, &jar).await?;
    let _ = request;
    Err(ApiError::not_implemented(
        "Download job creation is not implemented yet.",
    ))
}

async fn get_download_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let _user = require_user(&state, &jar).await?;
    let _ = job_id;
    Err(ApiError::not_implemented(
        "Download job polling is not implemented yet.",
    ))
}

async fn download_job_file(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let _user = require_user(&state, &jar).await?;
    let _ = job_id;
    Err(ApiError::not_implemented(
        "Authenticated archive download is not implemented yet.",
    ))
}

async fn require_user(state: &AppState, jar: &CookieJar) -> Result<SessionUser, ApiError> {
    auth::current_user_from_jar(state, jar)
        .await
        .context("failed to resolve current session")
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::unauthorized("authentication_required", "需要先登录后才能访问。"))
}

async fn require_admin(state: &AppState, jar: &CookieJar) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role != UserRole::Admin {
        return Err(ApiError::forbidden("forbidden", "当前账号没有管理员权限。"));
    }

    Ok(user)
}

#[derive(Debug)]
enum ApiError {
    BadRequest { code: &'static str, message: String },
    Unauthorized { code: &'static str, message: String },
    Forbidden { code: &'static str, message: String },
    PayloadTooLarge { message: String },
    NotFound { code: &'static str, message: String },
    NotImplemented { message: String },
    Internal(anyhow::Error),
}

impl ApiError {
    fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::BadRequest {
            code,
            message: message.into(),
        }
    }

    fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self::Unauthorized {
            code,
            message: message.into(),
        }
    }

    fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::Forbidden {
            code,
            message: message.into(),
        }
    }

    fn payload_too_large(message: impl Into<String>) -> Self {
        Self::PayloadTooLarge {
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound {
            code: "not_found",
            message: message.into(),
        }
    }

    fn not_implemented(message: impl Into<String>) -> Self {
        Self::NotImplemented {
            message: message.into(),
        }
    }

    fn internal(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            Self::BadRequest { code, message } => (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": code, "message": message })),
            )
                .into_response(),
            Self::Unauthorized { code, message } => (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": code, "message": message })),
            )
                .into_response(),
            Self::Forbidden { code, message } => (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": code, "message": message })),
            )
                .into_response(),
            Self::PayloadTooLarge { message } => (
                StatusCode::PAYLOAD_TOO_LARGE,
                Json(json!({ "error": "payload_too_large", "message": message })),
            )
                .into_response(),
            Self::NotFound { code, message } => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": code, "message": message })),
            )
                .into_response(),
            Self::NotImplemented { message } => (
                StatusCode::NOT_IMPLEMENTED,
                Json(json!({ "error": "not_implemented", "message": message })),
            )
                .into_response(),
            Self::Internal(error) => {
                tracing::error!(error = ?error, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": "internal_error",
                        "message": "服务器内部错误。"
                    })),
                )
                    .into_response()
            }
        }
    }
}

#[derive(serde::Deserialize)]
pub(crate) struct UploadQuery {
    #[serde(rename = "type")]
    source_type: Option<String>,
}

async fn upload_import_files(
    State(state): State<AppState>,
    jar: CookieJar,
    Query(query): Query<UploadQuery>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user = require_admin(&state, &jar).await?;

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
        return Err(ApiError::bad_request("no_files", "No files uploaded"));
    }

    let source_type = query.source_type.unwrap_or_else(|| "folder".to_string());

    // Create an import job for this temp directory
    sqlx::query(
        r#"
        INSERT INTO import_jobs (id, created_by_user_id, source_filename, source_archive_path, status, source_type)
        VALUES ($1, $2, $3, $4, 'queued', $5)
        "#
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
        StatusCode::PAYLOAD_TOO_LARGE => ApiError::payload_too_large(error.body_text()),
        StatusCode::BAD_REQUEST => ApiError::bad_request("invalid_multipart", error.body_text()),
        _ => ApiError::internal(error.into()),
    }
}

async fn list_import_jobs(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<serde_json::Value>, ApiError> {
    let _user = require_admin(&state, &jar).await?;

    let limit = 50i64;
    let rows = sqlx::query(
        r#"
        SELECT id, status, source_type, total_items, processed_items, succeeded_items, failed_items, created_at
        FROM import_jobs
        ORDER BY created_at DESC
        LIMIT $1
        "#
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
            "createdAt": row.try_get::<time::OffsetDateTime, _>("created_at").unwrap_or_else(|_| time::OffsetDateTime::now_utc()).format(&time::format_description::well_known::Rfc3339).unwrap_or_default(),
        }));
    }

    Ok(Json(json!({ "items": items })))
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
