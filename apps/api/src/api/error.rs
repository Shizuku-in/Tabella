use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::Value;
use serde_json::json;

#[derive(Debug)]
pub(crate) enum ApiError {
    BadRequest {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    Unauthorized {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    Forbidden {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    PayloadTooLarge {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    NotFound {
        code: &'static str,
        message: String,
        params: Option<Value>,
    },
    Internal(anyhow::Error),
}

impl ApiError {
    pub(crate) fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::BadRequest {
            code,
            message: message.into(),
            params: None,
        }
    }

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

    pub(crate) fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self::Unauthorized {
            code,
            message: message.into(),
            params: None,
        }
    }

    pub(crate) fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::Forbidden {
            code,
            message: message.into(),
            params: None,
        }
    }

    pub(crate) fn payload_too_large(message: impl Into<String>) -> Self {
        Self::PayloadTooLarge {
            code: crate::api::error_codes::PAYLOAD_TOO_LARGE,
            message: message.into(),
            params: None,
        }
    }

    pub(crate) fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::NotFound {
            code,
            message: message.into(),
            params: None,
        }
    }

    pub(crate) fn internal(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

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
