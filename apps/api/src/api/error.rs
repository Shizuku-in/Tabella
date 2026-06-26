//! Typed API error with a stable wire format for frontend i18n.
//!
//! Every error serializes to `{ "error": code, "message": fallback, "params": obj|null }`.
//! The frontend maps `code` to translated messages from `api.errors.*` i18n keys;
//! `params` carries interpolation values (e.g. `max_images`).
//!
//! See [`error_codes`](super::error_codes) for the canonical `&'static str` constants.
//! Adding a new error requires syncing three layers: Rust constant → `api-error-codes.ts` →
//! `en.json` / `zh-CN.json` / ...

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::Value;
use serde_json::json;

/// The single error type returned by all API handlers.
///
/// Five variants carry a structured `{ code, message, params }` payload.
/// [`Internal`](ApiError::Internal) carries an opaque `anyhow::Error` whose
/// details are logged but never exposed to the client.
#[derive(Debug)]
pub(crate) enum ApiError {
    /// Client error with an optional `params` payload for i18n interpolation.
    BadRequest {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    /// Unauthenticated — missing or expired session.
    Unauthorized {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    /// Insufficient role.
    Forbidden {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    /// Request body exceeds the configured size limit.
    PayloadTooLarge {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    /// Resource not found.
    NotFound {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    /// Unexpected error. Details are logged via `tracing::error!` and a generic
    /// `"internal_error"` response is returned to the client.
    Internal(anyhow::Error),
}

impl ApiError {
    /// 400 — request validation or business-rule failure.
    pub(crate) fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::BadRequest {
            code,
            message: message.into(),
            params: None,
        }
    }

    /// 400 — bad request with a `params` payload.
    pub(crate) fn bad_request_with_params(
        code: &'static str,
        message: impl Into<String>,
        params: Value,
    ) -> Self {
        Self::BadRequest {
            code,
            message: message.into(),
            params: Some(params),
        }
    }

    /// 401 — missing or expired session.
    pub(crate) fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self::Unauthorized {
            code,
            message: message.into(),
            params: None,
        }
    }

    /// 403 — insufficient role.
    pub(crate) fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::Forbidden {
            code,
            message: message.into(),
            params: None,
        }
    }

    /// 413 — request body exceeds configured limit.
    pub(crate) fn payload_too_large(message: impl Into<String>) -> Self {
        Self::PayloadTooLarge {
            code: crate::api::error_codes::PAYLOAD_TOO_LARGE,
            message: message.into(),
            params: None,
        }
    }

    /// 404 — resource not found.
    pub(crate) fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::NotFound {
            code,
            message: message.into(),
            params: None,
        }
    }

    /// 500 — unexpected error. Details are logged but never sent to the client.
    pub(crate) fn internal(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

/// Maps each variant to its HTTP status code and a JSON body in the canonical
/// `{ error, message, params }` shape. The [`Internal`](ApiError::Internal)
/// variant additionally logs the full error via `tracing::error!`.
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            Self::BadRequest {
                code,
                message,
                params,
            } => (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": code, "message": message, "params": params })),
            )
                .into_response(),
            Self::Unauthorized {
                code,
                message,
                params,
            } => (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": code, "message": message, "params": params })),
            )
                .into_response(),
            Self::Forbidden {
                code,
                message,
                params,
            } => (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": code, "message": message, "params": params })),
            )
                .into_response(),
            Self::PayloadTooLarge {
                code,
                message,
                params,
            } => (
                StatusCode::PAYLOAD_TOO_LARGE,
                Json(json!({ "error": code, "message": message, "params": params })),
            )
                .into_response(),
            Self::NotFound {
                code,
                message,
                params,
            } => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": code, "message": message, "params": params })),
            )
                .into_response(),

            Self::Internal(error) => {
                tracing::error!(error = ?error, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "error": crate::api::error_codes::INTERNAL_ERROR,
                        "message": "Internal server error.",
                        "params": Value::Null
                    })),
                )
                    .into_response()
            }
        }
    }
}
