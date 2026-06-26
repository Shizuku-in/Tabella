//! Tabella API server entry point.
//!
//! Startup: load config → init tracing → DB pool → run migrations → bootstrap
//! admin → start background workers → build router → bind.
//!
//! Router layering (order matters):
//! 1. Authenticated media router (`/media/*` behind `require_media_session`)
//! 2. Blocklist (404 private directories: `/tmp`, `/media/temp`, `/media/downloads`, …)
//! 3. API router (`/api/*`)
//! 4. SPA fallback (`ServeDir` on `TABELLA_FRONTEND_DIR` with `index.html` 404 fallback)

mod api;
mod auth;
mod config;
mod dto;
mod image_processor;

mod import_worker;
mod tags;
mod tasks;

use std::time::Duration;

use anyhow::Context;
use axum::{Router, http::StatusCode, middleware, routing::any};
use config::Config;
use sqlx::postgres::PgPoolOptions;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// An event broadcast to all connected SSE clients.
#[derive(Clone, Debug, serde::Serialize)]
pub(crate) struct ServerEvent {
    pub(crate) event: String,
    pub(crate) data: serde_json::Value,
}

/// Application state cloned into every handler and background worker.
#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Config,
    pub(crate) pool: sqlx::PgPool,
    pub(crate) tx: tokio::sync::broadcast::Sender<ServerEvent>,
    /// Signalled on shutdown so background workers can stop accepting new work
    /// and exit cleanly once their current job finishes.
    pub(crate) shutdown: tokio_util::sync::CancellationToken,
}

/// Full startup sequence: env → config → tracing → DB → workers → router → serve.
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables from .env file if it exists
    dotenvy::dotenv().ok();

    init_tracing();

    let config = Config::from_env().context("failed to load configuration")?;

    if !config.secure_cookies {
        tracing::warn!(
            "TABELLA_SECURE_COOKIES=false: session cookies are sent without the Secure attribute. \
             If this service is served over HTTPS, set TABELLA_SECURE_COOKIES=true, otherwise the \
             session cookie may be exposed over plaintext connections."
        );
    }

    let pool = PgPoolOptions::new()
        .max_connections(config.database_pool_size)
        .connect(&config.database_url)
        .await
        .context("failed to connect to PostgreSQL")?;

    sqlx::migrate!()
        .run(&pool)
        .await
        .context("failed to run database migrations")?;

    auth::bootstrap_default_admin(&pool, &config)
        .await
        .context("failed to bootstrap default admin")?;

    let (tx, _rx) = tokio::sync::broadcast::channel(512);

    let shutdown = tokio_util::sync::CancellationToken::new();

    let app_state = AppState {
        config: config.clone(),
        pool: pool.clone(),
        tx,
        shutdown: shutdown.clone(),
    };

    // Spawn the import worker; keep its handle so we can wait for the in-flight
    // job to finish during graceful shutdown.
    let import_worker_handle = tokio::spawn(import_worker::start_worker(app_state.clone()));
    // The cleanup worker is a periodic, idempotent task with no in-flight state
    // worth protecting, so it can be dropped on shutdown.
    tokio::spawn(tasks::cleanup::run_cleanup_worker(
        pool.clone(),
        config.temp_root.clone(),
        config.media_root.clone(),
    ));

    let frontend_dir = std::env::var("TABELLA_FRONTEND_DIR").unwrap_or_else(|_| "dist".to_string());
    let frontend_path = std::path::Path::new(&frontend_dir);

    let media_root = config.media_root.clone();
    let media_router = Router::new()
        .nest_service(
            "/media/originals",
            ServeDir::new(media_root.join("originals")),
        )
        .nest_service("/media/samples", ServeDir::new(media_root.join("samples")))
        .nest_service(
            "/media/thumbnails",
            ServeDir::new(media_root.join("thumbnails")),
        )
        .nest_service("/media/avatars", ServeDir::new(media_root.join("avatars")))
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            api::require_media_session,
        ));

    let private_static_blocklist = Router::new()
        .route("/tmp", any(not_found))
        .route("/tmp/{*path}", any(not_found))
        .route("/media/temp", any(not_found))
        .route("/media/temp/{*path}", any(not_found))
        .route("/media/temp_extract", any(not_found))
        .route("/media/temp_extract/{*path}", any(not_found))
        .route("/media/downloads", any(not_found))
        .route("/media/downloads/{*path}", any(not_found));

    let mut app = Router::new()
        .merge(media_router)
        .merge(private_static_blocklist)
        .merge(api::router(app_state));

    if frontend_path.exists() {
        tracing::info!("serving frontend from {:?}", frontend_path);
        let index_path = frontend_path.join("index.html");
        let serve_dir = ServeDir::new(frontend_path)
            .not_found_service(tower_http::services::ServeFile::new(index_path));
        app = app.fallback_service(serve_dir);
    } else {
        tracing::warn!(
            "frontend directory {:?} not found, skipping frontend serving",
            frontend_path
        );
    }

    let app = app.layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(config.listen_addr)
        .await
        .with_context(|| format!("failed to bind {}", config.listen_addr))?;

    tracing::info!(
        listen_addr = %config.listen_addr,
        media_root = ?config.media_root,
        temp_root = ?config.temp_root,
        session_cookie_name = %config.session_cookie_name,
        bootstrap_admin_username = %config.bootstrap_admin_username,
        "tabella api listening"
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown.clone()))
        .await
        .context("axum server exited unexpectedly")?;

    // `shutdown_signal` already cancelled the token the moment the signal
    // arrived, so the import worker stopped claiming new jobs and open SSE
    // streams ended (letting graceful shutdown drain and return). Now wait for
    // the worker to finish its in-flight job, bounded by a timeout so a large
    // archive can't hang shutdown.
    tracing::info!("HTTP server stopped, draining background workers");

    const WORKER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);
    match tokio::time::timeout(WORKER_SHUTDOWN_TIMEOUT, import_worker_handle).await {
        Ok(Ok(())) => tracing::info!("import worker drained cleanly"),
        Ok(Err(e)) => tracing::error!("import worker task panicked during shutdown: {:?}", e),
        Err(_) => tracing::warn!(
            "import worker did not finish within {}s; exiting anyway (the in-flight job will be \
             reset to failed on next startup)",
            WORKER_SHUTDOWN_TIMEOUT.as_secs()
        ),
    }

    Ok(())
}

/// Resolves when the process receives a shutdown signal (Ctrl-C on all
/// platforms, plus SIGTERM on Unix for `systemctl stop` / container stop).
///
/// Cancels `shutdown` the instant a signal arrives so background workers stop
/// claiming new work and long-lived connections (e.g. SSE) can end, allowing
/// `axum::serve`'s graceful shutdown to actually complete.
async fn shutdown_signal(shutdown: tokio_util::sync::CancellationToken) {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("failed to install Ctrl-C handler: {:?}", e);
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(e) => tracing::error!("failed to install SIGTERM handler: {:?}", e),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    tracing::info!("shutdown signal received, cancelling background workers");
    shutdown.cancel();
}

/// Initialises tracing with an env-filter (`RUST_LOG` or `api=debug,tower_http=info`).
fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "api=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

/// SPA fallback handler; returns 404 for unknown `/api/` routes.
async fn not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}
