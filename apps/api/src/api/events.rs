use axum::{
    extract::State,
    response::sse::{Event, Sse},
};
use axum_extra::extract::CookieJar;
use futures_util::stream::Stream;
use std::convert::Infallible;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use super::{error::ApiError, guards::require_user};
use crate::AppState;

pub(crate) async fn sse_handler(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    // Authenticate user
    let _user = require_user(&state, &jar).await?;

    let rx = state.tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        match res {
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
        }
    });

    Ok(Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default()))
}
