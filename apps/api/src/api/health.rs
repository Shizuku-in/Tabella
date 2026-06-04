use axum::{Json, Router, extract::State, routing::get};

use crate::{AppState, dto::HealthResponse};

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .with_state(state)
}

async fn healthz(State(state): State<AppState>) -> Json<HealthResponse> {
    let settings = crate::config::DynamicConfig::load(&state.pool, &state.config).await;
    Json(HealthResponse {
        status: "ok",
        service: "tabella-api",
        max_download_images: settings.max_download_images,
        download_retention_hours: settings.download_retention_hours,
    })
}
