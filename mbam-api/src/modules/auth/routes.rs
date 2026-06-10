use axum::{routing::post, Json, Router};
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

use super::dto::{LoginRequest, SignupRequest};

/// Registers authentication routes under `/api/v1/auth`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/signup", post(signup))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
}

/// Accepts signup requests.
///
/// The database implementation will create a user, business account, default
/// master owner membership, and initial session in the next backend step.
async fn signup(Json(_payload): Json<SignupRequest>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({
        "message": "signup route ready",
        "next": "connect auth service and repository"
    })))
}

/// Accepts login requests.
///
/// The database implementation will verify the password, create a session, and
/// return workspace context after auth is wired.
async fn login(Json(_payload): Json<LoginRequest>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({
        "message": "login route ready",
        "next": "connect password verification and token generation"
    })))
}

/// Placeholder route for refresh token rotation.
async fn refresh() -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "message": "refresh route ready" })))
}

/// Placeholder route for logout and refresh token revocation.
async fn logout() -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({ "message": "logout route ready" })))
}
