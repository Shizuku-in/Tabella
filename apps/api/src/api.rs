use anyhow::Context;
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState, auth,
    dto::{
        AuthUserResponse, DownloadJobRequest, HealthResponse, ListImagesQuery, ListImagesResponse,
        LoginRequest, SessionUser, TagSuggestQuery, UserRole,
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
    let _user = require_user(&state, &jar).await?;
    let _ = query;

    Ok(Json(ListImagesResponse {
        items: Vec::new(),
        next_cursor: None,
    }))
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
    let _user = require_user(&state, &jar).await?;
    let _ = image_id;
    Err(ApiError::not_implemented(
        "Favorites persistence is not implemented yet.",
    ))
}

async fn remove_favorite(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(image_id): Path<i64>,
) -> Result<Response, ApiError> {
    let _user = require_user(&state, &jar).await?;
    let _ = image_id;
    Err(ApiError::not_implemented(
        "Favorites persistence is not implemented yet.",
    ))
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
