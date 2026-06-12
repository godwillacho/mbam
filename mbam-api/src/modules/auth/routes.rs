use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue},
    routing::post,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, state::AppState};

use super::{
    dto::{AuthResponse, LoginRequest, SignupRequest},
    service,
};

const REFRESH_COOKIE_NAME: &str = "mbam_refresh_token";

#[derive(Debug, Deserialize)]
struct EmailRequest {
    email: String,
}

/// Registers authentication routes under `/api/v1/auth`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/signup", post(signup))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
        .route("/password-reset", post(password_reset))
        .route("/verification/resend", post(resend_verification))
}

async fn signup(
    State(state): State<AppState>,
    Json(payload): Json<SignupRequest>,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let response = service::signup(&state.db, &state.config, payload).await?;
    auth_response(&state, response)
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let response = service::login(&state.db, &state.config, payload).await?;
    auth_response(&state, response)
}

async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let refresh_token = refresh_cookie(&headers).ok_or(ApiError::Unauthorized)?;
    let response = service::refresh(&state.db, &state.config, refresh_token).await?;
    auth_response(&state, response)
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    if let Some(refresh_token) = refresh_cookie(&headers) {
        service::logout(&state.db, refresh_token).await?;
    }

    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "mbam_refresh_token=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0",
        ),
    );
    Ok((response_headers, Json(json!({ "message": "logged out" }))))
}

async fn password_reset(Json(payload): Json<EmailRequest>) -> Json<Value> {
    let _normalized_email = service::normalize_email(&payload.email);
    Json(json!({ "message": "If the account exists, reset instructions will be sent." }))
}

async fn resend_verification(Json(payload): Json<EmailRequest>) -> Json<Value> {
    let _normalized_email = service::normalize_email(&payload.email);
    Json(json!({ "message": "If verification is pending, a new message will be sent." }))
}

fn auth_response(
    state: &AppState,
    response: AuthResponse,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let secure = if state.config.app_env == "development" {
        ""
    } else {
        "; Secure"
    };
    let cookie = format!(
        "{REFRESH_COOKIE_NAME}={}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age={}{}",
        response.refresh_token,
        state.config.refresh_token_days * 24 * 60 * 60,
        secure,
    );
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| ApiError::Internal)?,
    );
    Ok((headers, Json(response)))
}

fn refresh_cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|cookie| cookie.strip_prefix(&format!("{REFRESH_COOKIE_NAME}=")))
}
