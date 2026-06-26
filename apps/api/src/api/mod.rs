//! Per-feature API route modules merged into a single [`Router`].
//!
//! # Route tree
//!
//! ```text
//! /api/events           SSE stream
//! /api/auth/*           login / logout
//! /api/me               current user
//! /api/images/*         image CRUD
//! /api/favorites/*      image favorites
//! /api/tags/*           tag listing / suggestions
//! /api/stats            gallery statistics
//! /api/download-jobs/*  archive creation / polling / download
//! /api/admin/imports/*  import management (editor+)
//! /api/profile/*        self-service profile
//! /api/settings         dynamic config (admin)
//! /api/admin/users/*    user CRUD (admin)
//! ```
//!
//! # Guard hierarchy
//!
//! Handlers call guards explicitly: `require_user` → `require_editor` → `require_admin`.
//! Roles are `admin > editor > viewer`. [`require_media_session`] is a middleware
//! on the separate media router (not in this tree); see `main.rs` for the full
//! router composition.

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

pub(crate) use guards::require_media_session;

/// Builds the API router tree by merging all feature sub-routers.
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
