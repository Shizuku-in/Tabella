use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use axum_extra::extract::CookieJar;

use crate::{
    AppState,
    api::guards::require_admin,
    auth::{hash_password, normalize_username},
    dto::{CreateUserRequest, UpdateUserRequest, UserResponse, UserRole},
};

use super::error::ApiError;

pub(crate) async fn list_users(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Json<Vec<UserResponse>>, ApiError> {
    let _admin = require_admin(&state, &jar).await?;

    let rows = sqlx::query!(
        r#"
        select id, username, role, created_at, avatar_url
        from users
        order by created_at desc
        "#
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| ApiError::internal(e.into()))?;

    let users = rows
        .into_iter()
        .map(|row| {
            let role = match row.role.as_str() {
                "admin" => UserRole::Admin,
                "editor" => UserRole::Editor,
                _ => UserRole::Viewer,
            };
            UserResponse {
                id: row.id,
                username: row.username,
                role,
                created_at: row.created_at,
                avatar_url: row.avatar_url,
            }
        })
        .collect();

    Ok(Json(users))
}

pub(crate) async fn create_user(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(payload): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<UserResponse>), ApiError> {
    let _admin = require_admin(&state, &jar).await?;

    let normalized = normalize_username(&payload.username);
    if normalized.is_empty() {
        return Err(ApiError::bad_request(
            crate::api::error_codes::INVALID_USERNAME,
            "Username cannot be empty",
        ));
    }

    validate_password(&payload.password)?;

    let password_hash = hash_password(&payload.password).map_err(ApiError::internal)?;

    let role_str = match payload.role {
        UserRole::Admin => "admin",
        UserRole::Editor => "editor",
        UserRole::Viewer => "viewer",
    };

    let row = sqlx::query!(
        r#"
        insert into users (username, normalized_username, password_hash, role)
        values ($1, $2, $3, $4)
        returning id, created_at
        "#,
        payload.username,
        normalized,
        password_hash,
        role_str,
    )
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

    Ok((
        StatusCode::CREATED,
        Json(UserResponse {
            id: row.id,
            username: payload.username,
            role: payload.role,
            created_at: row.created_at,
            avatar_url: None,
        }),
    ))
}

pub(crate) async fn update_user(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateUserRequest>,
) -> Result<StatusCode, ApiError> {
    let admin = require_admin(&state, &jar).await?;

    let current_role: Option<String> = sqlx::query_scalar("select role from users where id = $1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    let current_role = match current_role {
        Some(r) => r,
        None => {
            return Err(ApiError::not_found(
                crate::api::error_codes::USER_NOT_FOUND,
                "User not found",
            ));
        }
    };

    if let Some(ref new_role) = payload.role
        && id == admin.id
        && *new_role != admin.role
    {
        return Err(ApiError::bad_request(
            crate::api::error_codes::ROLE_CHANGE_NOT_ALLOWED,
            "You cannot change your own role",
        ));
    }

    let mut query_builder = sqlx::QueryBuilder::new("update users set updated_at = now()");

    let mut has_updates = false;
    let mut role_changed = false;
    let mut password_changed = false;

    if let Some(role) = payload.role {
        let role_str = match role {
            UserRole::Admin => "admin",
            UserRole::Editor => "editor",
            UserRole::Viewer => "viewer",
        };
        if role_str != current_role {
            query_builder.push(", role = ");
            query_builder.push_bind(role_str);
            has_updates = true;
            role_changed = true;
        }
    }

    if let Some(password) = payload.password {
        validate_password(&password)?;
        let password_hash = hash_password(&password).map_err(ApiError::internal)?;
        query_builder.push(", password_hash = ");
        query_builder.push_bind(password_hash);
        has_updates = true;
        password_changed = true;
    }

    if !has_updates {
        return Ok(StatusCode::NO_CONTENT);
    }

    query_builder.push(" where id = ");
    query_builder.push_bind(id);

    let _result = query_builder
        .build()
        .execute(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    if role_changed || password_changed {
        // Invalidate all existing sessions for this user because their credentials or role changed,
        // but preserve the current session if the admin is editing themselves.
        if let Some(current_session_id) =
            crate::auth::session_id_from_jar(&jar, &state.config.session_cookie_name)
        {
            sqlx::query("delete from sessions where user_id = $1 and id != $2")
                .bind(id)
                .bind(current_session_id)
                .execute(&state.pool)
                .await
                .map_err(|e| ApiError::internal(e.into()))?;
        } else {
            sqlx::query("delete from sessions where user_id = $1")
                .bind(id)
                .execute(&state.pool)
                .await
                .map_err(|e| ApiError::internal(e.into()))?;
        }
    }

    Ok(StatusCode::OK)
}

pub(crate) async fn delete_user(
    State(state): State<AppState>,
    jar: CookieJar,
    Path(id): Path<i64>,
) -> Result<StatusCode, ApiError> {
    let admin = require_admin(&state, &jar).await?;

    if id == admin.id {
        return Err(ApiError::bad_request(
            crate::api::error_codes::SELF_DELETE_NOT_ALLOWED,
            "You cannot delete your own account",
        ));
    }

    let result = sqlx::query!("delete from users where id = $1", id)
        .execute(&state.pool)
        .await
        .map_err(|e| ApiError::internal(e.into()))?;

    if result.rows_affected() == 0 {
        return Err(ApiError::not_found(
            crate::api::error_codes::USER_NOT_FOUND,
            "User not found",
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub(crate) fn routes(state: AppState) -> axum::Router {
    axum::Router::new()
        .route(
            "/api/admin/users",
            axum::routing::get(list_users).post(create_user),
        )
        .route(
            "/api/admin/users/{id}",
            axum::routing::put(update_user).delete(delete_user),
        )
        .with_state(state)
}

pub(crate) fn validate_password(password: &str) -> Result<(), ApiError> {
    if password.chars().count() < 8 {
        return Err(ApiError::bad_request(
            crate::api::error_codes::WEAK_PASSWORD_TOO_SHORT,
            "Password must be at least 8 characters long",
        ));
    }
    if !password.chars().any(|c| c.is_ascii_lowercase()) {
        return Err(ApiError::bad_request(
            crate::api::error_codes::WEAK_PASSWORD_MISSING_LOWERCASE,
            "Password must contain at least one lowercase letter",
        ));
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(ApiError::bad_request(
            crate::api::error_codes::WEAK_PASSWORD_MISSING_NUMBER,
            "Password must contain at least one number",
        ));
    }
    Ok(())
}
