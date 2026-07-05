//! Dynamic config read/write (admin only). `PUT` does a full replace — partial
//! merge is not supported.

use axum::{
    Json, Router,
    extract::State,
    routing::{get, put},
};
use axum_extra::extract::CookieJar;

use crate::{AppState, config::DynamicConfig};

use super::{error::ApiError, guards::require_admin};

/// Registers `GET /api/settings` and `PUT /api/settings` (admin only).
pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/settings", get(get_settings))
        .route("/api/settings", put(update_settings))
        .with_state(state)
}

/// Returns the current [`DynamicConfig`].
async fn get_settings(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<DynamicConfig>, ApiError> {
    require_admin(&state, &jar).await?;
    Ok(Json(state.dynamic_config().await))
}

/// Validates and persists the full [`DynamicConfig`]. Partial merge is not
/// supported — the complete object must be sent.
async fn update_settings(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(new_settings): Json<DynamicConfig>,
) -> Result<Json<DynamicConfig>, ApiError> {
    require_admin(&state, &jar).await?;

    new_settings.validate().map_err(|_| {
        ApiError::bad_request(
            crate::api::error_codes::INVALID_SETTINGS,
            "Server settings are invalid.",
        )
    })?;

    new_settings
        .save(&state.pool)
        .await
        .map_err(ApiError::internal)?;

    // Refresh the in-memory cache so all subsequent requests see the new config
    // without a DB round-trip.
    state.refresh_dynamic_config().await;

    Ok(Json(new_settings))
}
