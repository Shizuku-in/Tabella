//! Role-based guards called at the top of every handler.
//!
//! Hierarchy: [`require_user`] → [`require_editor`] → [`require_admin`]
//! (admin > editor > viewer). [`require_media_session`] is a standalone
//! middleware for the media file router.

use anyhow::Context;
use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use axum_extra::extract::CookieJar;

use crate::{
    AppState, auth,
    dto::{SessionUser, UserRole},
};

use super::error::ApiError;

/// Resolves the current user from the session cookie. Returns 401 when
/// unauthenticated.
pub(crate) async fn require_user(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    auth::current_user_from_jar(state, jar)
        .await
        .context("failed to resolve current session")
        .map_err(ApiError::internal)?
        .ok_or_else(|| {
            ApiError::unauthorized(
                crate::api::error_codes::AUTHENTICATION_REQUIRED,
                "Authentication required.",
            )
        })
}

/// Calls [`require_user`] then checks for `Admin` role. Returns 403 otherwise.
pub(crate) async fn require_admin(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role != UserRole::Admin {
        return Err(ApiError::forbidden(
            crate::api::error_codes::ADMIN_REQUIRED,
            "Admin privileges required.",
        ));
    }

    Ok(user)
}

/// Calls [`require_user`] then checks for `Admin` or `Editor` role. Returns
/// 403 for viewers.
pub(crate) async fn require_editor(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role == UserRole::Viewer {
        return Err(ApiError::forbidden(
            crate::api::error_codes::EDITOR_REQUIRED,
            "Editor or admin privileges required.",
        ));
    }

    Ok(user)
}

/// Axum middleware that checks for a valid session (lightweight — no user data
/// load, no `last_seen_at` update). Used on the `/media/` router.
pub(crate) async fn require_media_session(
    State(state): State<AppState>,
    jar: CookieJar,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let has_session = auth::check_session_from_jar(&state, &jar)
        .await
        .context("failed to check media session")
        .map_err(ApiError::internal)?;

    if !has_session {
        return Err(ApiError::unauthorized(
            crate::api::error_codes::AUTHENTICATION_REQUIRED,
            "Authentication required.",
        ));
    }

    Ok(next.run(request).await)
}
