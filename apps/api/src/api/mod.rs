mod auth_handlers;
mod downloads;
mod error;
pub mod error_codes;
mod events;
mod guards;
mod health;
mod images;
mod imports;
mod profile;
mod settings;
mod users;

use axum::Router;

use crate::AppState;

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
        .merge(health::routes(state.clone()))
        .merge(auth_handlers::routes(state.clone()))
        .merge(images::routes(state.clone()))
        .merge(imports::routes(state.clone()))
        .merge(downloads::routes(state.clone()))
        .merge(profile::routes(state.clone()))
        .merge(settings::routes(state.clone()))
        .merge(users::routes(state.clone()))
        .route(
            "/api/events",
            axum::routing::get(events::sse_handler).with_state(state),
        )
}
