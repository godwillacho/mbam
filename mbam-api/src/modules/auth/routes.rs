use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderValue},
    response::Redirect,
    routing::{get, post},
    Json, Router,
};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

use super::{
    dto::{AuthResponse, CompletePasswordResetRequest, LoginRequest, SignupRequest},
    service,
};

const REFRESH_COOKIE_NAME: &str = "mbam_refresh_token";
const DEVICE_HINT_COOKIE_NAME: &str = "mbam_device_hint";
const DEVICE_CONTEXT_COOKIE_NAME: &str = "mbam_device_context";
const DEVICE_ID_HEADER: &str = "x-mbam-device-id";
const DEVICE_FINGERPRINT_HEADER: &str = "x-mbam-device-fingerprint";
const GOOGLE_STATE_COOKIE_NAME: &str = "mbam_google_oauth_state";
const MICROSOFT_STATE_COOKIE_NAME: &str = "mbam_microsoft_oauth_state";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Deserialize)]
struct EmailRequest {
    email: String,
}

#[derive(Debug, Deserialize)]
struct OAuthCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/signup", post(signup))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
        .route("/password-reset", post(password_reset))
        .route("/password-reset/complete", post(complete_password_reset))
        .route("/verification/resend", post(resend_verification))
        .route("/oauth/google/start", get(google_start))
        .route("/oauth/google/callback", get(google_callback))
        .route("/oauth/microsoft/start", get(microsoft_start))
        .route("/oauth/microsoft/callback", get(microsoft_callback))
}

async fn signup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SignupRequest>,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let response = service::signup(&state.db, &state.config, payload).await?;
    auth_response(&state, &headers, response)
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let response = service::login(&state.db, &state.config, payload).await?;
    auth_response(&state, &headers, response)
}

async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    validate_device_context(&state, &headers)?;
    let refresh_token = refresh_cookie(&headers).ok_or(ApiError::Unauthorized)?;
    let response = service::refresh(&state.db, &state.config, refresh_token).await?;
    auth_response(&state, &headers, response)
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    if let Some(refresh_token) = refresh_cookie(&headers) {
        service::logout(&state.db, refresh_token).await?;
    }

    let mut response_headers = HeaderMap::new();
    response_headers.append(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "mbam_refresh_token=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0",
        ),
    );
    response_headers.append(
        header::SET_COOKIE,
        HeaderValue::from_static(
            "mbam_device_context=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0",
        ),
    );
    Ok((response_headers, Json(json!({ "message": "logged out" }))))
}

async fn password_reset(
    State(state): State<AppState>,
    Json(payload): Json<EmailRequest>,
) -> Result<Json<Value>, ApiError> {
    if let Err(error) =
        service::request_password_reset(&state.db, &state.config, &payload.email).await
    {
        tracing::error!(?error, "password reset request could not be completed");
    }
    Ok(Json(
        json!({ "message": "If the account exists, reset instructions will be sent." }),
    ))
}

async fn complete_password_reset(
    State(state): State<AppState>,
    Json(payload): Json<CompletePasswordResetRequest>,
) -> Result<Json<Value>, ApiError> {
    service::complete_password_reset(&state.db, payload).await?;
    Ok(Json(json!({ "message": "password updated" })))
}

async fn resend_verification(Json(payload): Json<EmailRequest>) -> Json<Value> {
    let _normalized_email = service::normalize_email(&payload.email);
    Json(json!({ "message": "If verification is pending, a new message will be sent." }))
}

async fn google_start(
    State(state): State<AppState>,
    request_headers: HeaderMap,
) -> Result<(HeaderMap, Redirect), ApiError> {
    let (Some(client_id), Some(redirect_uri), Some(_client_secret)) = (
        state.config.google_oauth_client_id.as_deref(),
        state.config.google_oauth_redirect_uri.as_deref(),
        state.config.google_oauth_client_secret.as_deref(),
    ) else {
        return oauth_error_redirect(&state, "google_not_configured");
    };

    let oauth_state = Uuid::new_v4().to_string();
    let mut authorization_url = reqwest::Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|_| ApiError::Internal)?;
    authorization_url.query_pairs_mut().extend_pairs([
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("state", oauth_state.as_str()),
        ("prompt", "select_account"),
    ]);

    let mut headers = HeaderMap::new();
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&oauth_state_cookie(&state, &oauth_state, 600))
            .map_err(|_| ApiError::Internal)?,
    );
    append_device_context_cookie(&state, &request_headers, &mut headers)?;
    Ok((headers, Redirect::temporary(authorization_url.as_str())))
}

async fn google_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<(HeaderMap, Redirect), ApiError> {
    if query.error.is_some() {
        return oauth_error_redirect(&state, "google_denied");
    }

    let expected_state =
        cookie_value(&headers, GOOGLE_STATE_COOKIE_NAME).ok_or(ApiError::Unauthorized)?;
    let returned_state = query.state.as_deref().ok_or(ApiError::Unauthorized)?;
    if expected_state != returned_state {
        return Err(ApiError::Unauthorized);
    }

    let code = query.code.as_deref().ok_or(ApiError::Unauthorized)?;
    let response = match service::login_with_google(&state.db, &state.config, code).await {
        Ok(response) => response,
        Err(_) => return oauth_error_redirect(&state, "google_failed"),
    };

    let mut response_headers = auth_cookie_headers(&state, &headers, &response)?;
    response_headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&oauth_state_cookie(&state, "", 0))
            .map_err(|_| ApiError::Internal)?,
    );
    Ok((
        response_headers,
        Redirect::to(&format!("{}/auth?oauth=complete", state.config.web_origin)),
    ))
}

fn auth_response(
    state: &AppState,
    request_headers: &HeaderMap,
    response: AuthResponse,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let headers = auth_cookie_headers(state, request_headers, &response)?;
    Ok((headers, Json(response)))
}

fn auth_cookie_headers(
    state: &AppState,
    request_headers: &HeaderMap,
    response: &AuthResponse,
) -> Result<HeaderMap, ApiError> {
    let secure = secure_cookie_suffix(state);
    let cookie = format!(
        "{REFRESH_COOKIE_NAME}={}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age={}{}",
        response.refresh_token,
        state.config.refresh_token_days * 24 * 60 * 60,
        secure,
    );
    let mut headers = HeaderMap::new();
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| ApiError::Internal)?,
    );
    append_device_context_cookie(state, request_headers, &mut headers)?;
    Ok(headers)
}

fn refresh_cookie(headers: &HeaderMap) -> Option<&str> {
    cookie_value(headers, REFRESH_COOKIE_NAME)
}

fn device_binding(headers: &HeaderMap) -> Option<(&str, &str)> {
    let header_binding = headers
        .get(DEVICE_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .zip(
            headers
                .get(DEVICE_FINGERPRINT_HEADER)
                .and_then(|value| value.to_str().ok()),
        );
    if header_binding.is_some() {
        return header_binding;
    }
    cookie_value(headers, DEVICE_HINT_COOKIE_NAME)?.split_once('.')
}

fn device_signature(
    state: &AppState,
    device_id: &str,
    fingerprint: &str,
) -> Result<String, ApiError> {
    let mut mac = HmacSha256::new_from_slice(state.config.jwt_access_secret.as_bytes())
        .map_err(|_| ApiError::Internal)?;
    mac.update(device_id.as_bytes());
    mac.update(b".");
    mac.update(fingerprint.as_bytes());
    Ok(format!("{:x}", mac.finalize().into_bytes()))
}

fn device_context_cookie(
    state: &AppState,
    device_id: &str,
    fingerprint: &str,
) -> Result<String, ApiError> {
    let signature = device_signature(state, device_id, fingerprint)?;
    Ok(format!(
        "{DEVICE_CONTEXT_COOKIE_NAME}={device_id}.{fingerprint}.{signature}; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age={}{}",
        state.config.refresh_token_days * 24 * 60 * 60,
        secure_cookie_suffix(state),
    ))
}

fn append_device_context_cookie(
    state: &AppState,
    request_headers: &HeaderMap,
    response_headers: &mut HeaderMap,
) -> Result<(), ApiError> {
    let (device_id, fingerprint) = device_binding(request_headers).ok_or(ApiError::Unauthorized)?;
    let cookie = device_context_cookie(state, device_id, fingerprint)?;
    response_headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| ApiError::Internal)?,
    );
    Ok(())
}

fn validate_device_context(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let (device_id, fingerprint) = device_binding(headers).ok_or(ApiError::Unauthorized)?;
    let stored = cookie_value(headers, DEVICE_CONTEXT_COOKIE_NAME).ok_or(ApiError::Unauthorized)?;
    let expected_signature = device_signature(state, device_id, fingerprint)?;
    let expected = format!("{device_id}.{fingerprint}.{expected_signature}");
    if stored != expected {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|cookie| cookie.strip_prefix(&format!("{name}=")))
}

fn secure_cookie_suffix(state: &AppState) -> &'static str {
    if state.config.app_env == "development" {
        ""
    } else {
        "; Secure"
    }
}

fn oauth_state_cookie(state: &AppState, value: &str, max_age: i32) -> String {
    format!(
        "{GOOGLE_STATE_COOKIE_NAME}={value}; HttpOnly; SameSite=Lax; Path=/api/v1/auth/oauth/google; Max-Age={max_age}{}",
        secure_cookie_suffix(state),
    )
}

fn oauth_error_redirect(state: &AppState, error: &str) -> Result<(HeaderMap, Redirect), ApiError> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&oauth_state_cookie(state, "", 0)).map_err(|_| ApiError::Internal)?,
    );
    Ok((
        headers,
        Redirect::to(&format!(
            "{}/auth?oauth_error={error}",
            state.config.web_origin
        )),
    ))
}

async fn microsoft_start(
    State(state): State<AppState>,
    request_headers: HeaderMap,
) -> Result<(HeaderMap, Redirect), ApiError> {
    let (Some(client_id), Some(redirect_uri), Some(_client_secret)) = (
        state.config.microsoft_oauth_client_id.as_deref(),
        state.config.microsoft_oauth_redirect_uri.as_deref(),
        state.config.microsoft_oauth_client_secret.as_deref(),
    ) else {
        return oauth_error_redirect_for(
            &state,
            "microsoft_not_configured",
            MICROSOFT_STATE_COOKIE_NAME,
        );
    };

    let oauth_state = Uuid::new_v4().to_string();
    let mut authorization_url =
        reqwest::Url::parse("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
            .map_err(|_| ApiError::Internal)?;
    authorization_url.query_pairs_mut().extend_pairs([
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("response_mode", "query"),
        ("scope", "openid profile email User.Read"),
        ("state", oauth_state.as_str()),
        ("prompt", "select_account"),
    ]);

    let mut headers = HeaderMap::new();
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&oauth_state_cookie_for(
            &state,
            MICROSOFT_STATE_COOKIE_NAME,
            &oauth_state,
            600,
        ))
        .map_err(|_| ApiError::Internal)?,
    );
    append_device_context_cookie(&state, &request_headers, &mut headers)?;
    Ok((headers, Redirect::temporary(authorization_url.as_str())))
}

async fn microsoft_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<(HeaderMap, Redirect), ApiError> {
    if query.error.is_some() {
        return oauth_error_redirect_for(&state, "microsoft_denied", MICROSOFT_STATE_COOKIE_NAME);
    }

    let expected_state =
        cookie_value(&headers, MICROSOFT_STATE_COOKIE_NAME).ok_or(ApiError::Unauthorized)?;
    let returned_state = query.state.as_deref().ok_or(ApiError::Unauthorized)?;
    if expected_state != returned_state {
        return Err(ApiError::Unauthorized);
    }

    let code = query.code.as_deref().ok_or(ApiError::Unauthorized)?;
    let response = match service::login_with_microsoft(&state.db, &state.config, code).await {
        Ok(response) => response,
        Err(_) => {
            return oauth_error_redirect_for(
                &state,
                "microsoft_failed",
                MICROSOFT_STATE_COOKIE_NAME,
            )
        }
    };
    let mut response_headers = auth_cookie_headers(&state, &headers, &response)?;
    response_headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&oauth_state_cookie_for(
            &state,
            MICROSOFT_STATE_COOKIE_NAME,
            "",
            0,
        ))
        .map_err(|_| ApiError::Internal)?,
    );
    Ok((
        response_headers,
        Redirect::to(&format!("{}/auth?oauth=complete", state.config.web_origin)),
    ))
}

fn oauth_state_cookie_for(
    state: &AppState,
    cookie_name: &str,
    value: &str,
    max_age: i32,
) -> String {
    format!(
        "{cookie_name}={value}; HttpOnly; SameSite=Lax; Path=/api/v1/auth/oauth; Max-Age={max_age}{}",
        secure_cookie_suffix(state),
    )
}

fn oauth_error_redirect_for(
    state: &AppState,
    error: &str,
    cookie_name: &str,
) -> Result<(HeaderMap, Redirect), ApiError> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&oauth_state_cookie_for(state, cookie_name, "", 0))
            .map_err(|_| ApiError::Internal)?,
    );
    Ok((
        headers,
        Redirect::to(&format!(
            "{}/auth?oauth_error={error}",
            state.config.web_origin
        )),
    ))
}
