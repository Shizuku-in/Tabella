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
        .ok_or_else(|| ApiError::unauthorized("authentication_required", "需要先登录后才能访问。"))
}

pub(crate) async fn require_admin(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role != UserRole::Admin {
        return Err(ApiError::forbidden("forbidden", "当前账号没有管理员权限。"));
    }

    Ok(user)
}

pub(crate) async fn require_editor(
    state: &AppState,
    jar: &CookieJar,
) -> Result<SessionUser, ApiError> {
    let user = require_user(state, jar).await?;

    if user.role == UserRole::Viewer {
        return Err(ApiError::forbidden("forbidden", "需要编辑者或管理员权限。"));
    }

    Ok(user)
}
