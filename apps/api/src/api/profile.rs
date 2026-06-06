use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::StatusCode,
    routing::{get, post},
};
use axum_extra::extract::CookieJar;
use serde_json::json;
use tokio::io::AsyncWriteExt;

use crate::{
    AppState,
    api::error::ApiError,
    api::guards::require_user,
    auth::{hash_password, normalize_username},
    dto::{UpdateProfileRequest, UserResponse},
};

const MAX_AVATAR_UPLOAD_BYTES: usize = 5 * 1024 * 1024; // 5 MB

pub(crate) fn routes(state: AppState) -> Router {
    Router::new()
        .route("/api/profile", get(get_profile).put(update_profile))
        .route(
            "/api/profile/avatar",
            post(upload_avatar).layer(DefaultBodyLimit::max(MAX_AVATAR_UPLOAD_BYTES)),
        )
        .with_state(state)
}

async fn get_profile(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<UserResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;

    let row = sqlx::query!(
        r#"
        select id, username, role, created_at, avatar_url
        from users
        where id = $1
        "#,
        user.id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    use crate::dto::UserRole;
    let role = match row.role.as_str() {
        "admin" => UserRole::Admin,
        "editor" => UserRole::Editor,
        _ => UserRole::Viewer,
    };

    Ok(Json(UserResponse {
        id: row.id,
        username: row.username,
        role,
        created_at: row.created_at,
        avatar_url: row.avatar_url,
    }))
}

async fn update_profile(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UserResponse>, ApiError> {
    let user = require_user(&state, &jar).await?;
    let current_password = payload
        .current_password
        .clone()
        .filter(|value| !value.is_empty());
    let new_password = payload
        .new_password
        .clone()
        .filter(|value| !value.is_empty());

    if current_password.is_some() && new_password.is_none() {
        return Err(ApiError::bad_request(
            crate::api::error_codes::MISSING_NEW_PASSWORD,
            "New password is required when current password is provided",
        ));
    }

    if new_password.is_some() && current_password.is_none() {
        return Err(ApiError::bad_request(
            crate::api::error_codes::MISSING_CURRENT_PASSWORD,
            "Current password is required to set a new password",
        ));
    }

    let mut query_builder = sqlx::QueryBuilder::new("update users set updated_at = now()");
    let mut has_updates = false;

    if let Some(username) = payload.username {
        let normalized = normalize_username(&username);
        if normalized.is_empty() {
            return Err(ApiError::bad_request(
                crate::api::error_codes::INVALID_USERNAME,
                "Username cannot be empty",
            ));
        }
        query_builder.push(", username = ");
        query_builder.push_bind(username);
        query_builder.push(", normalized_username = ");
        query_builder.push_bind(normalized);
        has_updates = true;
    }

    if let (Some(new_password), Some(current_password)) = (new_password, current_password) {
        let current_hash: String =
            sqlx::query_scalar("select password_hash from users where id = $1")
                .bind(user.id)
                .fetch_one(&state.pool)
                .await
                .map_err(|e| ApiError::internal(e.into()))?;

        if !crate::auth::verify_password(&current_password, &current_hash)
            .map_err(ApiError::internal)?
        {
            return Err(ApiError::bad_request(
                crate::api::error_codes::INVALID_PASSWORD,
                "Current password is incorrect",
            ));
        }

        crate::api::users::validate_password(&new_password)?;

        let new_hash = hash_password(&new_password).map_err(ApiError::internal)?;

        query_builder.push(", password_hash = ");
        query_builder.push_bind(new_hash);
        has_updates = true;
    }

    if !has_updates {
        return get_profile(State(state), jar).await;
    }

    query_builder.push(" where id = ");
    query_builder.push_bind(user.id);
    query_builder.push(" returning id, username, role, created_at, avatar_url");

    let row = query_builder
        .build()
        .fetch_one(&state.pool)
        .await
        .map_err(|err| {
            if let sqlx::Error::Database(ref db_err) = err
                && db_err.constraint() == Some("users_normalized_username_key")
            {
                return ApiError::bad_request(
                    crate::api::error_codes::DUPLICATE_USERNAME,
                    "Username is already taken",
                );
            }
            ApiError::internal(err.into())
        })?;

    use crate::dto::UserRole;
    use sqlx::Row;
    let role_str: String = row.get("role");
    let role = match role_str.as_str() {
        "admin" => UserRole::Admin,
        "editor" => UserRole::Editor,
        _ => UserRole::Viewer,
    };

    Ok(Json(UserResponse {
        id: row.get("id"),
        username: row.get("username"),
        role,
        created_at: row.get("created_at"),
        avatar_url: row.get("avatar_url"),
    }))
}

async fn upload_avatar(
    State(state): State<AppState>,
    jar: CookieJar,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user = require_user(&state, &jar).await?;

    let avatars_dir = state.config.media_root.join("avatars");
    tokio::fs::create_dir_all(&avatars_dir)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let mut avatar_url = None;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(api_error_from_multipart)?
    {
        if field.name() == Some("file") {
            let content_type = field.content_type().unwrap_or("image/jpeg").to_string();
            let ext = if content_type.contains("png") {
                "png"
            } else if content_type.contains("gif") {
                "gif"
            } else {
                "jpg"
            };

            let file_name = format!("{}.{}", user.id, ext);
            let file_path = avatars_dir.join(&file_name);

            let mut output = tokio::fs::File::create(&file_path)
                .await
                .map_err(|e| ApiError::internal(e.into()))?;

            while let Some(chunk) = field.chunk().await.map_err(api_error_from_multipart)? {
                output
                    .write_all(&chunk)
                    .await
                    .map_err(|e| ApiError::internal(e.into()))?;
            }
            output
                .flush()
                .await
                .map_err(|e| ApiError::internal(e.into()))?;

            let timestamp = time::OffsetDateTime::now_utc().unix_timestamp();
            avatar_url = Some(format!("/media/avatars/{}?v={}", file_name, timestamp));
            break;
        }
    }

    let url = avatar_url.ok_or_else(|| {
        ApiError::bad_request(
            crate::api::error_codes::NO_FILE_UPLOADED,
            "No avatar file provided",
        )
    })?;

    sqlx::query!(
        "update users set avatar_url = $1, updated_at = now() where id = $2",
        url,
        user.id
    )
    .execute(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    Ok(Json(json!({
        "avatar_url": url
    })))
}

fn api_error_from_multipart(error: axum::extract::multipart::MultipartError) -> ApiError {
    match error.status() {
        StatusCode::PAYLOAD_TOO_LARGE => {
            ApiError::payload_too_large("Uploaded payload is too large.")
        }
        StatusCode::BAD_REQUEST => ApiError::bad_request(
            crate::api::error_codes::INVALID_MULTIPART,
            "Uploaded data could not be processed.",
        ),
        _ => ApiError::internal(error.into()),
    }
}
