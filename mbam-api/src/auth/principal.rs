use std::collections::BTreeSet;

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, HeaderMap},
};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

/// Represents the identity accepted by the Mbam API after token verification.
#[derive(Clone, Debug)]
pub struct AuthenticatedPrincipal {
    pub user_id: Uuid,
    pub keycloak_subject: Option<String>,
    pub asserted_keycloak_roles: Option<BTreeSet<String>>,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthenticatedPrincipal {
    type Rejection = ApiError;

    /// Extracts an authenticated identity without requiring business membership.
    ///
    /// Inputs are request headers and shared application state; output is a
    /// token-validated local identity suitable for pre-membership flows such as
    /// accepting an invitation. Invalid identity returns `401`. This extractor
    /// deliberately does not load permissions, grant business data access, or
    /// replace `AuthorizationContext` on protected domain routes.
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        state
            .authentication
            .authenticate(&parts.headers, &state.db)
            .await
    }
}

/// Extracts a bearer token from an HTTP Authorization header.
///
/// Input is the request header map and output is the non-empty token slice.
/// Missing headers, non-UTF-8 values, empty tokens, and schemes other than the
/// exact `Bearer` scheme return `401`. This function assumes no proxy has
/// rewritten the header and does not validate token signature, claims, user
/// mapping, membership, permission, or scope.
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
