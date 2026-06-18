use uuid::Uuid;

use crate::security::tokens::{verify_access_token, AccessTokenClaims};

use super::keycloak::{
    extract_bearer_token, verify_keycloak_access_token, AuthenticatedPrincipal, KeycloakAuthError,
    KeycloakConfig,
};

/// Authentication provider selected for an API request.
///
/// Use `Keycloak` for production identity and role claims once the realm is ready.
/// `LocalJwt` exists only to keep current development routes working during the
/// migration and should be removed when Keycloak is the only supported provider.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuthenticationProvider {
    LocalJwt,
    Keycloak,
}

/// Configuration needed to authenticate a bearer token.
///
/// Route guards should receive this from application state rather than reading
/// environment variables directly. This keeps auth-provider selection in one
/// controlled boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuthenticationProviderConfig {
    LocalJwt { access_secret: String },
    Keycloak(KeycloakConfig),
}

/// Principal returned by the authentication layer after a bearer token is valid.
///
/// Domain services should gradually move toward the `Keycloak` variant. The
/// `LocalJwt` variant intentionally carries only a user id because local JWTs do
/// not contain role claims; role/scope authorization still has to be loaded from
/// PostgreSQL.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MbamPrincipal {
    LocalJwt { user_id: Uuid },
    Keycloak(AuthenticatedPrincipal),
}

/// Errors raised by the provider boundary.
///
/// Keep these separate from `ApiError` so the auth layer stays reusable from
/// middleware, extractors, and route handlers.
#[derive(Debug, thiserror::Error)]
pub enum AuthenticationProviderError {
    #[error("authorization header is missing or invalid")]
    MissingBearerToken,
    #[error("local jwt token is invalid")]
    InvalidLocalJwt,
    #[error(transparent)]
    Keycloak(#[from] KeycloakAuthError),
}

/// Parses an auth-provider name from configuration.
///
/// Accepted values are intentionally narrow. Unknown values fail closed to
/// Keycloak so production deployments do not silently fall back to local JWTs.
pub fn provider_from_name(value: &str) -> AuthenticationProvider {
    match value.trim().to_lowercase().as_str() {
        "local" | "local_jwt" | "jwt" => AuthenticationProvider::LocalJwt,
        "keycloak" => AuthenticationProvider::Keycloak,
        _ => AuthenticationProvider::Keycloak,
    }
}

/// Authenticates one HTTP Authorization header with the selected provider.
///
/// This is the route-guard entry point. Handlers should not decode local tokens
/// or Keycloak tokens themselves; they should call this boundary and then perform
/// permission plus business/unit scope checks using the returned principal.
pub async fn authenticate_authorization_header(
    authorization_header: &str,
    config: &AuthenticationProviderConfig,
) -> Result<MbamPrincipal, AuthenticationProviderError> {
    let token = extract_bearer_token(authorization_header)
        .map_err(|_| AuthenticationProviderError::MissingBearerToken)?;
    authenticate_bearer_token(token, config).await
}

/// Authenticates a raw bearer token with the selected provider.
///
/// Tests and middleware can call this after extracting the token. The Keycloak
/// branch verifies claims through the Keycloak boundary; the local branch exists
/// only as a temporary bridge while routes migrate.
pub async fn authenticate_bearer_token(
    token: &str,
    config: &AuthenticationProviderConfig,
) -> Result<MbamPrincipal, AuthenticationProviderError> {
    match config {
        AuthenticationProviderConfig::LocalJwt { access_secret } => {
            let claims = verify_local_access_token(token, access_secret)?;
            Ok(MbamPrincipal::LocalJwt { user_id: claims.sub })
        }
        AuthenticationProviderConfig::Keycloak(keycloak_config) => {
            let principal = verify_keycloak_access_token(token, keycloak_config).await?;
            Ok(MbamPrincipal::Keycloak(principal))
        }
    }
}

/// Verifies the legacy Mbam local JWT access token.
///
/// This helper is intentionally private to the provider boundary. New code should
/// not call `security::tokens::verify_access_token` directly because the target
/// architecture is Keycloak-authenticated routes.
fn verify_local_access_token(
    token: &str,
    access_secret: &str,
) -> Result<AccessTokenClaims, AuthenticationProviderError> {
    verify_access_token(token, access_secret)
        .map_err(|_| AuthenticationProviderError::InvalidLocalJwt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_provider_names_fail_toward_keycloak() {
        assert_eq!(provider_from_name("unexpected"), AuthenticationProvider::Keycloak);
    }

    #[test]
    fn local_aliases_are_explicit() {
        assert_eq!(provider_from_name("local_jwt"), AuthenticationProvider::LocalJwt);
        assert_eq!(provider_from_name("jwt"), AuthenticationProvider::LocalJwt);
    }
}
