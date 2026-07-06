//! Authentication endpoints: login, logout, current user.
//! Login is rate-limited to 5 failed attempts per IP per minute.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

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

/// Per-IP rate limit state for the login endpoint.
#[derive(Debug)]
struct LoginRateEntry {
    failures: u32,
    window_start: Instant,
}

/// In-memory rate limiter. A production deployment behind a single reverse proxy
/// may want to key on `X-Forwarded-For`; the key extraction is isolated in
/// [`client_ip_key`] so it can be adjusted without touching the rate-limit logic.
static LOGIN_RATE_LIMITER: std::sync::LazyLock<Mutex<HashMap<String, LoginRateEntry>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Window duration for failed-login rate limiting.
const RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(60);
/// Maximum failed login attempts per IP within the window.
const MAX_FAILED_ATTEMPTS: u32 = 5;

/// Extracts a rate-limit key from the request headers. Uses `X-Forwarded-For`
/// (first entry) when available (reverse-proxy deployment), otherwise falls back
/// to a catch-all key that groups all direct connections.
fn client_ip_key(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| String::from("0.0.0.0"))
}

/// Returns `true` when the client has exceeded the failed-login rate limit.
fn check_login_rate_limit(key: &str) -> bool {
    let mut map = LOGIN_RATE_LIMITER.lock().unwrap();
    let now = Instant::now();
    let entry = map.entry(key.to_string()).or_insert(LoginRateEntry {
        failures: 0,
        window_start: now,
    });
    // Reset the window if it has elapsed.
    if now.duration_since(entry.window_start) > RATE_LIMIT_WINDOW {
        entry.failures = 0;
        entry.window_start = now;
    }
    entry.failures >= MAX_FAILED_ATTEMPTS
}

/// Records a failed login attempt for the given key.
fn record_failed_login(key: &str) {
    let mut map = LOGIN_RATE_LIMITER.lock().unwrap();
    let now = Instant::now();
    let entry = map.entry(key.to_string()).or_insert(LoginRateEntry {
        failures: 0,
        window_start: now,
    });
    if now.duration_since(entry.window_start) > RATE_LIMIT_WINDOW {
        entry.failures = 0;
        entry.window_start = now;
    }
    entry.failures += 1;
}

/// Clears rate-limit state for a key (called after successful login).
fn clear_login_rate_limit(key: &str) {
    LOGIN_RATE_LIMITER.lock().unwrap().remove(key);
}

/// Registers `/api/me`, `/api/auth/login`, `/api/auth/logout`.
pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/me", get(get_me))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .with_state(state)
}

/// Returns the authenticated user from a valid session cookie.
async fn get_me(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<AuthUserResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;
    Ok(Json(AuthUserResponse { user }))
}

/// Authenticates credentials, creates a session, and sets the session cookie.
/// Rate-limited to 5 failed attempts per IP per minute.
async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> Result<(CookieJar, Json<AuthUserResponse>), ApiError> {
    let ip_key = client_ip_key(&headers);

    if check_login_rate_limit(&ip_key) {
        return Err(ApiError::too_many_requests(
            "Too many failed login attempts. Please wait before trying again.",
        ));
    }

    let username = request.username.trim();
    let password = &request.password;

    if username.is_empty() || password.is_empty() {
        return Err(ApiError::bad_request(
            crate::api::error_codes::MISSING_CREDENTIALS,
            "Username and password are required.",
        ));
    }

    let Some(user) = auth::authenticate(&state.pool, username, password)
        .await
        .context("failed to authenticate request")
        .map_err(ApiError::internal)?
    else {
        record_failed_login(&ip_key);
        return Err(ApiError::unauthorized(
            crate::api::error_codes::INVALID_CREDENTIALS,
            "Invalid username or password.",
        ));
    };

    clear_login_rate_limit(&ip_key);

    let user_agent = headers
        .get("user-agent")
        .and_then(|value| value.to_str().ok());
    let dynamic_config = state.dynamic_config().await;
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

/// Destroys the session and clears the cookie.
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

    let dynamic_config = state.dynamic_config().await;
    Ok((
        jar.add(auth::build_logout_cookie(
            &state.config.session_cookie_name,
            dynamic_config.secure_cookies,
        )),
        StatusCode::NO_CONTENT,
    ))
}
