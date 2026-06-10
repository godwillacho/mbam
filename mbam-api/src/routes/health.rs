use axum::{routing::get, Json, Router};
use serde::Serialize;

use crate::state::AppState;

/// Health response returned by `/health`.
#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
}

/// Registers health routes.
pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}

/// Confirms the API process is running.
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "mbam-api",
    })
}
