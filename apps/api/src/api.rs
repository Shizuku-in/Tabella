use anyhow::Context;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::extract::{CookieJar, Query};
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState, auth,
    dto::{
        AuthUserResponse, DownloadJobRequest, HealthResponse, ImageListItem, ListImagesQuery,
        ListImagesResponse, LoginRequest, Rating, SessionUser, TagSuggestQuery, UserRole,
    },
};

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
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
        .route("/api/admin/imports", post(create_import_job))
        .route("/api/admin/imports/{job_id}", get(get_import_job))
        .route("/api/download-jobs", post(create_download_job))
        .route("/api/download-jobs/{job_id}", get(get_download_job))
        .route("/api/download-jobs/{job_id}/file", get(download_job_file))
        .with_state(state)
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
        "SELECT i.id, i.original_filename, i.thumbnail_path, i.preview_path, i.original_path, i.width, i.height, i.rating, \
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

async fn create_import_job(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Response, ApiError> {
    let _admin = require_admin(&state, &jar).await?;
    Err(ApiError::not_implemented(
        "Zip import job enqueueing is not implemented yet.",
    ))
}

async fn get_import_job(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(job_id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let _admin = require_admin(&state, &jar).await?;
    let _ = job_id;
    Err(ApiError::not_implemented(
        "Import job status lookup is not implemented yet.",
    ))
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
