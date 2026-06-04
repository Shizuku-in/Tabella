mod api;
mod auth;
mod config;
mod dto;
mod image_processor;

mod import_worker;
mod tags;
mod tasks;

use anyhow::Context;
use axum::Router;
use config::Config;
use sqlx::postgres::PgPoolOptions;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Config,
    pub(crate) pool: sqlx::PgPool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables from .env file if it exists
    dotenvy::dotenv().ok();

    init_tracing();

    let config = Config::from_env().context("failed to load configuration")?;
    let pool = PgPoolOptions::new()
        .max_connections(8)
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

    let app_state = AppState {
        config: config.clone(),
        pool: pool.clone(),
    };

    // Spawn workers in the background
    tokio::spawn(import_worker::start_worker(pool.clone(), config.clone()));
    tokio::spawn(tasks::cleanup::run_cleanup_worker(
        pool.clone(),
        config.media_root.clone(),
    ));

    let app = Router::new()
        .nest_service(
            "/media",
            tower_http::services::ServeDir::new(&config.media_root),
        )
        .nest_service(
            "/tmp",
            tower_http::services::ServeDir::new(&config.temp_root),
        )
        .merge(api::router(app_state))
        .layer(TraceLayer::new_for_http());

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
        .await
        .context("axum server exited unexpectedly")?;

    Ok(())
}

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "api=debug,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}
