//! Server-Sent Events endpoint. Connect once per session; the frontend uses
//! exponential-backoff reconnect with a `HEAD` probe to detect 401.

use axum::{
    extract::State,
    response::sse::{Event, Sse},
};
use axum_extra::extract::CookieJar;
use futures_util::StreamExt;
use futures_util::stream::Stream;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;

use super::{error::ApiError, guards::require_user};
use crate::AppState;

/// Opens an SSE stream for real-time import/download job updates. Stream
/// terminates on server shutdown via `take_until(shutdown.cancelled())`.
pub(crate) async fn sse_handler(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    // Authenticate user
    let _user = require_user(&state, &jar).await?;

    let rx = state.tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        let mapped = match res {
            Ok(server_event) => {
                let event = Event::default()
                    .event(server_event.event)
                    .data(server_event.data.to_string());
                Some(Ok(event))
            }
            Err(_) => {
                // The receiver lagged too far behind, but we can just ignore or skip.
                None
            }
        };
        std::future::ready(mapped)
    });

    // End this long-lived stream when the server starts shutting down. Without
    // this, the open SSE connection would keep `axum::serve`'s graceful
    // shutdown waiting forever (an SSE stream never completes on its own).
    let shutdown = state.shutdown.clone();
    let stream = stream.take_until(async move { shutdown.cancelled().await });

    Ok(Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default()))
}
