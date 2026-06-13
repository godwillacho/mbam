//! Authentication business logic.
//!
//! This file coordinates validation, password hashing, token creation, account
//! setup, and repository calls. Route handlers stay thin and call this service.

use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::ApiError,
    security::{password, tokens},
};

use super::{
    dto::{AuthResponse, AuthUserResponse, LoginRequest, SignupRequest},
    repository,
};

#[derive(Debug, serde::Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
}

#[derive(Debug, serde::Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: String,
    email_verified: bool,
    name: String,
}

/// Normalizes emails before storing or comparing them.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

/// Creates a new user, master account, owner membership, and auth tokens.
pub async fn signup(
    db: &PgPool,
    config: &Config,
    payload: SignupRequest,
) -> Result<AuthResponse, ApiError> {
    let full_name = payload.full_name.trim();
    let email = normalize_email(&payload.email);
    let phone = payload
        .phone
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    validate_signup(full_name, &email, &payload.password)?;

    if repository::find_user_by_email(db, &email).await?.is_some() {
        return Err(ApiError::BadRequest(
            "an account already exists for this email".to_string(),
        ));
    }

    let password_hash =
        password::hash_password(&payload.password).map_err(|_| ApiError::Internal)?;
    let user =
        repository::create_user_with_master_account(db, full_name, &email, phone, &password_hash)
            .await?;

    build_auth_response(
        db,
        config,
        user.id,
        user.full_name,
        user.email,
        user.email_verified,
    )
    .await
}

/// Authenticates an existing user and creates fresh auth tokens.
pub async fn login(
    db: &PgPool,
    config: &Config,
    payload: LoginRequest,
) -> Result<AuthResponse, ApiError> {
    let email = normalize_email(&payload.email);
    let user = repository::find_user_by_email(db, &email)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    let stored_hash = user
        .password_hash
        .as_deref()
        .ok_or(ApiError::Unauthorized)?;

    if !password::verify_password(&payload.password, stored_hash) {
        return Err(ApiError::Unauthorized);
    }

    build_auth_response(
        db,
        config,
        user.id,
        user.full_name,
        user.email,
        user.email_verified,
    )
    .await
}

/// Rotates a valid refresh token and returns a fresh cloud session.
pub async fn refresh(
    db: &PgPool,
    config: &Config,
    raw_refresh_token: &str,
) -> Result<AuthResponse, ApiError> {
    let token_hash = hash_refresh_token(raw_refresh_token);
    let stored = repository::find_active_refresh_token(db, &token_hash)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    let user = repository::find_user_by_id(db, stored.user_id)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    repository::revoke_refresh_token(db, stored.id).await?;
    build_auth_response(
        db,
        config,
        user.id,
        user.full_name,
        user.email,
        user.email_verified,
    )
    .await
}

/// Revokes the current refresh token during logout.
pub async fn logout(db: &PgPool, raw_refresh_token: &str) -> Result<(), ApiError> {
    let token_hash = hash_refresh_token(raw_refresh_token);
    if let Some(stored) = repository::find_active_refresh_token(db, &token_hash).await? {
        repository::revoke_refresh_token(db, stored.id).await?;
    }
    Ok(())
}

/// Exchanges a Google authorization code and creates a normal Mbam session.
pub async fn login_with_google(
    db: &PgPool,
    config: &Config,
    code: &str,
) -> Result<AuthResponse, ApiError> {
    let client_id = config
        .google_oauth_client_id
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Google sign-in is not configured".to_string()))?;
    let client_secret = config
        .google_oauth_client_secret
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Google sign-in is not configured".to_string()))?;
    let redirect_uri = config
        .google_oauth_redirect_uri
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("Google sign-in is not configured".to_string()))?;

    let client = reqwest::Client::new();
    let token_response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|_| ApiError::Unauthorized)?;

    if !token_response.status().is_success() {
        return Err(ApiError::Unauthorized);
    }

    let token = token_response
        .json::<GoogleTokenResponse>()
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    let user_info_response = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(token.access_token)
        .send()
        .await
        .map_err(|_| ApiError::Unauthorized)?;

    if !user_info_response.status().is_success() {
        return Err(ApiError::Unauthorized);
    }

    let profile = user_info_response
        .json::<GoogleUserInfo>()
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    if !profile.email_verified {
        return Err(ApiError::Unauthorized);
    }

    let email = normalize_email(&profile.email);
    let user = repository::find_or_create_oauth_user(
        db,
        repository::OAuthIdentity {
            provider: "google",
            provider_user_id: &profile.sub,
            email: &email,
            full_name: profile.name.trim(),
        },
    )
    .await?;

    build_auth_response(
        db,
        config,
        user.id,
        user.full_name,
        user.email,
        user.email_verified,
    )
    .await
}

/// Builds the public authentication response and stores a hashed refresh token.
async fn build_auth_response(
    db: &PgPool,
    config: &Config,
    user_id: Uuid,
    full_name: String,
    email: String,
    email_verified: bool,
) -> Result<AuthResponse, ApiError> {
    let access_token = tokens::create_access_token(
        user_id,
        &config.jwt_access_secret,
        config.access_token_minutes,
    )
    .map_err(|_| ApiError::Internal)?;
    let refresh_token = tokens::create_refresh_token();
    let refresh_hash = hash_refresh_token(&refresh_token);
    let refresh_expires_at = Utc::now() + Duration::days(config.refresh_token_days);

    repository::store_refresh_token(db, user_id, &refresh_hash, refresh_expires_at).await?;
    let offline_grant = if let Some(private_key) = config.offline_grant_private_key_pem.as_deref() {
        let scope = repository::get_offline_authorization_scope(db, user_id).await?;
        Some(
            tokens::create_offline_grant(
                tokens::OfflineGrantSubject {
                    user_id,
                    display_name: full_name.clone(),
                    email: email.clone(),
                    business_ids: scope.business_ids,
                    permissions: scope.permissions,
                    authorization_version: scope.authorization_version,
                },
                private_key,
                config.offline_grant_days,
            )
            .map_err(|_| ApiError::Internal)?,
        )
    } else {
        None
    };

    Ok(AuthResponse {
        user: AuthUserResponse {
            id: user_id,
            full_name,
            email,
            email_verified,
        },
        access_token,
        refresh_token,
        offline_grant,
    })
}

/// Validates signup input before database work starts.
fn validate_signup(full_name: &str, email: &str, password: &str) -> Result<(), ApiError> {
    if full_name.len() < 2 {
        return Err(ApiError::BadRequest(
            "full name must be at least 2 characters".to_string(),
        ));
    }

    if !email.contains('@') || email.len() < 5 {
        return Err(ApiError::BadRequest("email must be valid".to_string()));
    }

    if password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".to_string(),
        ));
    }

    Ok(())
}

/// Hashes refresh tokens before storing them.
///
/// Refresh tokens are bearer secrets. Storing only the hash reduces the damage
/// if the database is exposed.
fn hash_refresh_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}
