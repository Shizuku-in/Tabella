use anyhow::{Context, Result, anyhow};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use sqlx::{PgPool, Row};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{
    AppState,
    config::Config,
    dto::{SessionUser, UserRole},
};

pub(crate) async fn bootstrap_default_admin(pool: &PgPool, config: &Config) -> Result<()> {
    let admin_count: i64 = sqlx::query_scalar("select count(*) from users where role = 'admin'")
        .fetch_one(pool)
        .await
        .context("failed to check for existing admin users")?;

    if admin_count > 0 {
        return Ok(());
    }

    let password_hash = hash_password(&config.bootstrap_admin_password)?;
    let normalized_username = normalize_username(&config.bootstrap_admin_username);

    sqlx::query(
        r#"
        insert into users (username, normalized_username, password_hash, role)
        values ($1, $2, $3, 'admin')
        on conflict (normalized_username) do update
            set username = excluded.username,
                password_hash = excluded.password_hash,
                role = 'admin',
                updated_at = now()
        "#,
    )
    .bind(&config.bootstrap_admin_username)
    .bind(normalized_username)
    .bind(password_hash)
    .execute(pool)
    .await
    .context("failed to bootstrap default admin user")?;

    tracing::warn!(
        username = %config.bootstrap_admin_username,
        "bootstrapped default admin user; change the password in production"
    );

    Ok(())
}

pub(crate) async fn authenticate(
    pool: &PgPool,
    username: &str,
    password: &str,
) -> Result<Option<SessionUser>> {
    let row = sqlx::query(
        r#"
        select id, username, password_hash, role, avatar_url
        from users
        where normalized_username = $1
        "#,
    )
    .bind(normalize_username(username))
    .fetch_optional(pool)
    .await
    .context("failed to look up user credentials")?;

    let Some(row) = row else {
        return Ok(None);
    };

    let password_hash: String = row.get("password_hash");
    if !verify_password(password, &password_hash)? {
        return Ok(None);
    }

    Ok(Some(SessionUser {
        id: row.get("id"),
        username: row.get("username"),
        role: UserRole::try_from(row.get::<String, _>("role").as_str())?,
        avatar_url: row.get("avatar_url"),
    }))
}

pub(crate) async fn create_session(
    pool: &PgPool,
    config: &Config,
    user_id: i64,
    user_agent: Option<&str>,
) -> Result<(Uuid, OffsetDateTime)> {
    let session_id = Uuid::new_v4();
    let expires_at = OffsetDateTime::now_utc() + Duration::hours(config.session_ttl_hours as i64);

    sqlx::query(
        r#"
        insert into sessions (id, user_id, expires_at, user_agent)
        values ($1, $2, $3, $4)
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .bind(expires_at)
    .bind(user_agent)
    .execute(pool)
    .await
    .context("failed to create session")?;

    Ok((session_id, expires_at))
}

pub(crate) async fn current_user_from_jar(
    state: &AppState,
    jar: &CookieJar,
) -> Result<Option<SessionUser>> {
    let Some(session_id) = session_id_from_jar(jar, &state.config.session_cookie_name) else {
        return Ok(None);
    };

    let row = sqlx::query(
        r#"
        select u.id, u.username, u.role, u.avatar_url
        from sessions s
        join users u on u.id = s.user_id
        where s.id = $1
          and s.expires_at > now()
        "#,
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await
    .context("failed to fetch current session")?;

    let Some(row) = row else {
        return Ok(None);
    };

    sqlx::query("update sessions set last_seen_at = now() where id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await
        .context("failed to update session last_seen_at")?;

    Ok(Some(SessionUser {
        id: row.get("id"),
        username: row.get("username"),
        role: UserRole::try_from(row.get::<String, _>("role").as_str())?,
        avatar_url: row.get("avatar_url"),
    }))
}

pub(crate) async fn destroy_session(pool: &PgPool, session_id: Uuid) -> Result<()> {
    sqlx::query("delete from sessions where id = $1")
        .bind(session_id)
        .execute(pool)
        .await
        .context("failed to delete session")?;

    Ok(())
}

pub(crate) fn build_session_cookie(
    config: &Config,
    session_id: Uuid,
    expires_at: OffsetDateTime,
) -> Cookie<'static> {
    Cookie::build((config.session_cookie_name.clone(), session_id.to_string()))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.secure_cookies)
        .path("/")
        .expires(expires_at)
        .build()
}

pub(crate) fn build_logout_cookie(config: &Config) -> Cookie<'static> {
    Cookie::build((config.session_cookie_name.clone(), ""))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.secure_cookies)
        .path("/")
        .max_age(Duration::seconds(0))
        .build()
}

pub(crate) fn session_id_from_jar(jar: &CookieJar, cookie_name: &str) -> Option<Uuid> {
    jar.get(cookie_name)
        .and_then(|cookie| Uuid::parse_str(cookie.value()).ok())
}

pub(crate) fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| anyhow!("failed to hash password: {error}"))
}

pub(crate) fn verify_password(password: &str, password_hash: &str) -> Result<bool> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|error| anyhow!("stored password hash could not be parsed: {error}"))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub(crate) fn normalize_username(username: &str) -> String {
    username.trim().to_ascii_lowercase()
}
