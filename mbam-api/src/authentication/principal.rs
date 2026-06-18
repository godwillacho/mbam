use std::collections::BTreeSet;

use axum::http::{header, HeaderMap};
use uuid::Uuid;

use crate::error::ApiError;

/// Represents the identity accepted by the Mbam API after token verification.
#[derive(Clone, Debug)]
pub struct AuthenticatedPrincipal {
    pub user_id: Uuid,
    pub external_subject: String,
    pub roles: BTreeSet<String>,
}

/// Extracts a bearer token from an HTTP Authorization header.
///
/// This function rejects missing headers, non-UTF-8 values, empty tokens, and
/// authentication schemes other than the exact `Bearer` scheme.
pub fn bearer_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    let token = authorization
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)?;
    Ok(token)
}
