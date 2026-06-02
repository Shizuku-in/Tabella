use axum::{
    Json, Router,
    extract::{Path, State},
    response::Response,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use uuid::Uuid;

use crate::{AppState, dto::DownloadJobRequest};

use super::{error::ApiError, guards::require_user};

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/download-jobs", post(create_download_job))
        .route("/api/download-jobs/{job_id}", get(get_download_job))
        .route("/api/download-jobs/{job_id}/file", get(download_job_file))
        .with_state(state)
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
