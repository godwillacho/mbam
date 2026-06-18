use async_trait::async_trait;

use super::claims::AuthenticatedPrincipal;

/// Errors returned by an authentication provider implementation.
///
/// Keep this error enum provider-neutral so API handlers can fail closed without
/// knowing whether the source is Keycloak, another OIDC provider, or a test double.
#[derive(Debug, thiserror::Error)]
pub enum AuthProviderError {
    /// The Authorization header is missing, malformed, expired, or fails signature checks.
    #[error("invalid bearer token")]
    InvalidToken,
    /// The token is valid but cannot be mapped into a required MBAM baseline role.
    #[error("missing baseline role")]
    MissingBaselineRole,
    /// The provider configuration is incomplete or inconsistent.
    #[error("authentication provider is misconfigured: {0}")]
    Misconfigured(String),
    /// Provider metadata, JWKS, or token-introspection calls failed.
    #[error("authentication provider request failed: {0}")]
    ProviderUnavailable(String),
}

/// Provider-neutral authentication boundary for the API.
///
/// API middleware should depend on this trait, not directly on Keycloak. That keeps
/// token validation swappable and testable while preserving fail-closed behavior.
#[async_trait]
pub trait AuthProvider: Send + Sync {
    /// Validates a bearer token and returns normalized identity claims.
    ///
    /// Implementations must verify issuer, audience, expiry, not-before, signature,
    /// and subject. The returned principal must only be produced after those checks pass.
    async fn authenticate_bearer_token(
        &self,
        bearer_token: &str,
    ) -> Result<AuthenticatedPrincipal, AuthProviderError>;

    /// Returns the provider logout URL for browser-based sessions.
    ///
    /// Use this when the frontend needs to terminate both the MBAM session and the
    /// upstream Keycloak session. The method returns `None` when logout redirects are
    /// not configured for the current provider.
    fn logout_url(&self, post_logout_redirect_uri: Option<&str>) -> Option<String>;
}
