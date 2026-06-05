use anyhow::Context;
use axum_extra::extract::CookieJar;

use crate::{
    AppState, auth,
    dto::{SessionUser, UserRole},
};

use super::error::ApiError;

pub(crate) async fn require_user(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    auth::current_user_from_jar(state, jar)
        .await
        .context("failed to resolve current session")
        .map_err(ApiError::internal)?
        .ok_or_else(|| {
            ApiError::unauthorized("authentication_required", "Authentication required.")
        })
}

pub(crate) async fn require_admin(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role != UserRole::Admin {
        return Err(ApiError::forbidden(
            "admin_required",
            "Admin privileges required.",
        ));
    }

    Ok(user)
}

pub(crate) async fn require_editor(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role == UserRole::Viewer {
        return Err(ApiError::forbidden(
            "editor_required",
            "Editor or admin privileges required.",
        ));
    }

    Ok(user)
}
