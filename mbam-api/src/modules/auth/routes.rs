use axum::{extract::State, routing::post, Json, Router};
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

use super::{
    dto::{AuthResponse, LoginRequest, SignupRequest},
    service,
};

/// Registers authentication routes under `/api/v1/auth`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/signup", post(signup))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
}

/// Creates a user account and its first master-account workspace.
async fn signup(
    State(state): State<AppState>,
    Json(payload): Json<SignupRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let response = service::signup(&state.db, &state.config, payload).await?;
    Ok(Json(response))
}

/// Authenticates an existing user and returns access and refresh tokens.
async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let response = service::login(&state.db, &state.config, payload).await?;
    Ok(Json(response))
}

/// Placeholder route for refresh token rotation.
async fn refresh() -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "message": "refresh route ready" })))
}

/// Placeholder route for logout and refresh token revocation.
async fn logout() -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "message": "logout route ready" })))
}
