//! Cookie-session authentication with Argon2 password hashing.

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

/// Bootstraps a default admin if no admin user exists yet.
///
/// Uses `TABELLA_BOOTSTRAP_ADMIN_USERNAME` / `TABELLA_BOOTSTRAP_ADMIN_PASSWORD`
/// env vars. Idempotent — does nothing when an admin already exists.
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

/// Validates credentials and returns the user on success.
///
/// Returns `Ok(None)` for unknown username or wrong password — deliberately
/// indistinguishable to prevent user enumeration.
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

/// Creates a new session row with a UUID v4 id and returns the id + expiry.
///
/// `session_ttl_hours` comes from `DynamicConfig::session_ttl_hours`.
/// Caller is responsible for issuing the corresponding cookie via [`build_session_cookie`].
pub(crate) async fn create_session(
    pool: &PgPool,
    session_ttl_hours: u64,
    user_id: i64,
    user_agent: Option<&str>,
) -> Result<(Uuid, OffsetDateTime)> {
    let session_id = Uuid::new_v4();
    let expires_at = OffsetDateTime::now_utc() + Duration::hours(session_ttl_hours as i64);

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

/// Extracts the session cookie, validates it against the DB, and updates `last_seen_at`
/// in a single round-trip via a CTE.
///
/// Returns `Ok(None)` when unauthenticated (no cookie, expired, or invalid session).
pub(crate) async fn current_user_from_jar(
    state: &AppState,
    jar: &CookieJar,
) -> Result<Option<SessionUser>> {
    let Some(session_id) = session_id_from_jar(jar, &state.config.session_cookie_name) else {
        return Ok(None);
    };

    let row = sqlx::query(
        r#"
        WITH updated AS (
            UPDATE sessions SET last_seen_at = now()
            WHERE id = $1 AND expires_at > now()
            RETURNING user_id
        )
        SELECT u.id, u.username, u.role, u.avatar_url
        FROM updated s
        JOIN users u ON u.id = s.user_id
        "#,
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await
    .context("failed to fetch current session")?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(SessionUser {
        id: row.get("id"),
        username: row.get("username"),
        role: UserRole::try_from(row.get::<String, _>("role").as_str())?,
        avatar_url: row.get("avatar_url"),
    }))
}

/// Lightweight session check without fetching user data or updating `last_seen_at`.
///
/// Used by the SSE endpoint and media middleware where a full user load is unnecessary.
pub(crate) async fn check_session_from_jar(state: &AppState, jar: &CookieJar) -> Result<bool> {
    let Some(session_id) = session_id_from_jar(jar, &state.config.session_cookie_name) else {
        return Ok(false);
    };

    sqlx::query_scalar(
        r#"
        select exists (
            select 1
            from sessions
            where id = $1
              and expires_at > now()
        )
        "#,
    )
    .bind(session_id)
    .fetch_one(&state.pool)
    .await
    .context("failed to check current session")
}

/// Deletes a single session row. Used for logout and session invalidation on
/// password change.
pub(crate) async fn destroy_session(pool: &PgPool, session_id: Uuid) -> Result<()> {
    sqlx::query("delete from sessions where id = $1")
        .bind(session_id)
        .execute(pool)
        .await
        .context("failed to delete session")?;

    Ok(())
}

/// Builds a Set-Cookie header value for a new session.
///
/// HttpOnly + SameSite=Lax always; Secure is toggled via `secure_cookies`
/// (should be `true` in production behind HTTPS).
pub(crate) fn build_session_cookie(
    session_cookie_name: &str,
    secure_cookies: bool,
    session_id: Uuid,
    expires_at: OffsetDateTime,
) -> Cookie<'static> {
    Cookie::build((session_cookie_name.to_string(), session_id.to_string()))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(secure_cookies)
        .path("/")
        .expires(expires_at)
        .build()
}

/// Builds an empty Set-Cookie with `max_age=0` to clear the session cookie.
pub(crate) fn build_logout_cookie(
    session_cookie_name: &str,
    secure_cookies: bool,
) -> Cookie<'static> {
    Cookie::build((session_cookie_name.to_string(), ""))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(secure_cookies)
        .path("/")
        .max_age(Duration::seconds(0))
        .build()
}

/// Parses the session UUID from a cookie. Returns `None` if the cookie is
/// absent or its value is not a valid UUID.
pub(crate) fn session_id_from_jar(jar: &CookieJar, cookie_name: &str) -> Option<Uuid> {
    jar.get(cookie_name)
        .and_then(|cookie| Uuid::parse_str(cookie.value()).ok())
}

/// Hashes a password with Argon2 (default params, random salt per call).
pub(crate) fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| anyhow!("failed to hash password: {error}"))
}

/// Verifies a password against a stored Argon2 hash. Returns `Ok(true)` on match,
/// `Ok(false)` on mismatch, and `Err` only when the stored hash is malformed.
pub(crate) fn verify_password(password: &str, password_hash: &str) -> Result<bool> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|error| anyhow!("stored password hash could not be parsed: {error}"))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Normalizes a username to trimmed lowercase for uniqueness comparison.
pub(crate) fn normalize_username(username: &str) -> String {
    username.trim().to_ascii_lowercase()
}
