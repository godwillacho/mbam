use axum::Router;

use crate::state::AppState;

pub mod health;

/// Builds top-level routes for the API.
pub fn router() -> Router<AppState> {
    Router::new().merge(health::router())
}
