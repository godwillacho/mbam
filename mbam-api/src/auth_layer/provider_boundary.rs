use std::future::Future;
use std::pin::Pin;

use super::claims::AuthenticatedPrincipal;

/// Provider-neutral authentication error.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderBoundaryError {
    /// The request did not contain a usable authenticated identity token.
    InvalidIdentity,
    /// The identity token was valid, but no MBAM baseline role could be resolved.
    MissingBaselineRole,
    /// The provider settings are incomplete.
    Misconfigured(String),
    /// The identity provider could not be reached or verified.
    ProviderUnavailable(String),
}

/// Provider-neutral boundary for future Keycloak authentication.
pub trait ProviderBoundary: Send + Sync {
    /// Validates provider identity data and returns normalized MBAM claims.
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<AuthenticatedPrincipal, ProviderBoundaryError>> + Send + 'a>>;
}
