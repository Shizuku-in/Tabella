use anyhow::Context;
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
};
use axum_extra::extract::CookieJar;

use crate::{
    AppState, auth,
    dto::{AuthUserResponse, LoginRequest},
};

use super::{error::ApiError, guards::require_user};

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/me", get(get_me))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .with_state(state)
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
            "Username and password are required.",
        ));
    }

    let Some(user) = auth::authenticate(&state.pool, username, password)
        .await
        .context("failed to authenticate request")
        .map_err(ApiError::internal)?
    else {
        return Err(ApiError::unauthorized(
            "invalid_credentials",
            "Invalid username or password.",
        ));
    };

    let user_agent = headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok());
    let dynamic_config = crate::config::DynamicConfig::load(&state.pool, &state.config).await;
    let (session_id, expires_at) = auth::create_session(
        &state.pool,
        dynamic_config.session_ttl_hours,
        user.id,
        user_agent,
    )
    .await
    .context("failed to create session")
    .map_err(ApiError::internal)?;

    let jar = jar.add(auth::build_session_cookie(
        &state.config.session_cookie_name,
        dynamic_config.secure_cookies,
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

    let dynamic_config = crate::config::DynamicConfig::load(&state.pool, &state.config).await;
    Ok((
        jar.add(auth::build_logout_cookie(
            &state.config.session_cookie_name,
            dynamic_config.secure_cookies,
        )),
        StatusCode::NO_CONTENT,
    ))
}
