//! Unauthenticated health-check endpoint.

use axum::{Json, Router, routing::get};

use crate::dto::HealthResponse;

/// Registers `GET /healthz` (no auth).
pub(crate) fn routes() -> Router {
    Router::new().route("/healthz", get(healthz))
}

/// Returns service status and version.
async fn healthz() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "tabella-api",
        version: env!("CARGO_PKG_VERSION"),
    })
}
