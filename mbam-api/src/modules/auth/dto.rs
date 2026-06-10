use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Signup payload sent by the frontend.
#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub full_name: String,
    pub email: String,
    pub phone: Option<String>,
    pub password: String,
}

/// Login payload sent by the frontend.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Public user shape returned to the frontend after authentication.
#[derive(Debug, Serialize)]
pub struct AuthUserResponse {
    pub id: Uuid,
    pub full_name: String,
    pub email: String,
    pub email_verified: bool,
}

/// Authentication response returned after signup or login.
#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: AuthUserResponse,
    pub access_token: String,
    pub refresh_token: String,
}
