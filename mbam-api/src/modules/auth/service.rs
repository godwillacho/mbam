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
    dto::{
        AuthResponse, AuthUserResponse, CompletePasswordResetRequest, LoginRequest, SignupRequest,
    },
    mailer, repository,
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

#[derive(Debug, serde::Deserialize)]
struct MicrosoftTokenResponse {
    access_token: String,
}

#[derive(Debug, serde::Deserialize)]
struct MicrosoftUserInfo {
    id: String,
    #[serde(rename = "displayName")]
    display_name: String,
    mail: Option<String>,
    #[serde(rename = "userPrincipalName")]
    user_principal_name: String,
}

/// Normalizes emails before storing or comparing them.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

/// Creates a new user, master account, owner membership, and auth tokens.
pub async fn signup(
    db: &PgPool,
    config: &Config,
    device_id: Uuid,
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
        device_id,
        true,
    )
    .await
}

/// Authenticates an existing user and creates fresh auth tokens.
pub async fn login(
    db: &PgPool,
    config: &Config,
    device_id: Uuid,
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
        device_id,
        true,
    )
    .await
}

/// Rotates a valid refresh token and returns a fresh cloud session.
pub async fn refresh(
    db: &PgPool,
    config: &Config,
    device_id: Uuid,
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
        device_id,
        false,
    )
    .await
}

/// Revokes the current refresh token during logout.
pub async fn logout(db: &PgPool, raw_refresh_token: &str) -> Result<(), ApiError> {
    let token_hash = hash_refresh_token(raw_refresh_token);
    if let Some(stored) = repository::find_active_refresh_token(db, &token_hash).await? {
        repository::revoke_refresh_token(db, stored.id).await?;
        crate::modules::audit::record_user_session_event(
            db,
            stored.user_id,
            "authentication.logout",
        )
        .await?;
    }
    Ok(())
}

/// Exchanges a Google authorization code and creates a normal Mbam session.
pub async fn login_with_google(
    db: &PgPool,
    config: &Config,
    device_id: Uuid,
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
        device_id,
        true,
    )
    .await
}

pub async fn login_with_microsoft(
    db: &PgPool,
    config: &Config,
    device_id: Uuid,
    code: &str,
) -> Result<AuthResponse, ApiError> {
    let client_id = config
        .microsoft_oauth_client_id
        .as_deref()
        .ok_or(ApiError::Internal)?;
    let client_secret = config
        .microsoft_oauth_client_secret
        .as_deref()
        .ok_or(ApiError::Internal)?;
    let redirect_uri = config
        .microsoft_oauth_redirect_uri
        .as_deref()
        .ok_or(ApiError::Internal)?;
    let client = reqwest::Client::new();
    let token_response = client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("code", code),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
            ("scope", "openid profile email User.Read"),
        ])
        .send()
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    if !token_response.status().is_success() {
        return Err(ApiError::Unauthorized);
    }

    let token = token_response
        .json::<MicrosoftTokenResponse>()
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    let profile_response = client
        .get("https://graph.microsoft.com/v1.0/me")
        .query(&[("$select", "id,displayName,mail,userPrincipalName")])
        .bearer_auth(token.access_token)
        .send()
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    if !profile_response.status().is_success() {
        return Err(ApiError::Unauthorized);
    }

    let profile = profile_response
        .json::<MicrosoftUserInfo>()
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    let email = normalize_email(
        profile
            .mail
            .as_deref()
            .unwrap_or(&profile.user_principal_name),
    );
    if !email.contains('@') {
        return Err(ApiError::Unauthorized);
    }
    let user = repository::find_or_create_oauth_user(
        db,
        repository::OAuthIdentity {
            provider: "microsoft",
            provider_user_id: &profile.id,
            email: &email,
            full_name: profile.display_name.trim(),
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
        device_id,
        true,
    )
    .await
}

pub async fn request_password_reset(
    db: &PgPool,
    config: &Config,
    email: &str,
) -> Result<(), ApiError> {
    let email = normalize_email(email);
    let Some(user) = repository::find_user_by_email(db, &email).await? else {
        return Ok(());
    };

    let raw_token = Uuid::new_v4().to_string();
    let token_hash = hash_secret(&raw_token);
    repository::store_password_reset_token(
        db,
        user.id,
        &token_hash,
        Utc::now() + Duration::minutes(30),
    )
    .await?;
    let reset_url = format!("{}/reset-password?token={raw_token}", config.web_origin);
    mailer::send_password_reset(config, &user.full_name, &user.email, &reset_url).await
}

pub async fn complete_password_reset(
    db: &PgPool,
    payload: CompletePasswordResetRequest,
) -> Result<(), ApiError> {
    validate_password(&payload.password)?;
    let password_hash =
        password::hash_password(&payload.password).map_err(|_| ApiError::Internal)?;
    let consumed = repository::consume_password_reset_token(
        db,
        &hash_secret(payload.token.trim()),
        &password_hash,
    )
    .await?;
    if !consumed {
        return Err(ApiError::BadRequest(
            "password reset link is invalid or expired".to_string(),
        ));
    }
    Ok(())
}

/// Builds the public authentication response and stores a hashed refresh token.
async fn build_auth_response(
    db: &PgPool,
    config: &Config,
    user_id: Uuid,
    full_name: String,
    email: String,
    email_verified: bool,
    device_id: Uuid,
    record_login_event: bool,
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
    if record_login_event {
        let _ = crate::modules::audit::record_user_session_event(
            db,
            user_id,
            "authentication.login",
        )
        .await;
    }
    let offline_grant = if let Some(private_key) = config.offline_grant_private_key_pem.as_deref() {
        let scope = repository::get_offline_authorization_scope(db, user_id).await?;
        let baselines = scope
            .role_codes
            .iter()
            .filter_map(|role| crate::authentication::BaselineRole::from_local_role_code(role))
            .collect::<std::collections::BTreeSet<_>>();
        let baseline_role = baselines
            .iter()
            .next()
            .filter(|_| baselines.len() == 1)
            .ok_or(ApiError::Unauthorized)?;
        Some(
            tokens::create_offline_grant(
                tokens::OfflineGrantSubject {
                    user_id,
                    display_name: full_name.clone(),
                    email: email.clone(),
                    device_id,
                    baseline_role: baseline_role.code().to_string(),
                    business_ids: scope.business_ids,
                    business_unit_ids: scope.business_unit_ids,
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

    validate_password(password)
}

fn validate_password(password: &str) -> Result<(), ApiError> {
    if password.len() < 8
        || !password.chars().any(char::is_uppercase)
        || !password.chars().any(|value| value.is_ascii_digit())
    {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters with an uppercase letter and number"
                .to_string(),
        ));
    }
    Ok(())
}

/// Hashes refresh tokens before storing them.
///
/// Refresh tokens are bearer secrets. Storing only the hash reduces the damage
/// if the database is exposed.
fn hash_refresh_token(token: &str) -> String {
    hash_secret(token)
}

fn hash_secret(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}
