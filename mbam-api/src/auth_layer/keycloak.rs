use std::future::Future;
use std::pin::Pin;

use super::{claims::AuthenticatedPrincipal, provider::AuthProviderError};

/// Runtime configuration for the Keycloak authentication provider.
#[derive(Debug, Clone)]
pub struct KeycloakConfig {
    /// Realm issuer URL, for example an internal company Keycloak realm.
    pub issuer: String,
    /// Expected backend audience or client id for MBAM API access.
    pub audience: String,
    /// JSON Web Key Set URL used to verify Keycloak signatures.
    pub jwks_url: String,
}

impl KeycloakConfig {
    /// Creates provider configuration from validated application settings.
    pub fn new(
        issuer: impl Into<String>,
        audience: impl Into<String>,
        jwks_url: impl Into<String>,
    ) -> Self {
        Self {
            issuer: issuer.into(),
            audience: audience.into(),
            jwks_url: jwks_url.into(),
        }
    }
}

/// Keycloak-backed authentication provider scaffold.
///
/// The final implementation should verify Keycloak JWT signatures, issuer,
/// audience, expiry, not-before, and baseline role claims here before the request
/// reaches business services.
pub struct KeycloakAuthProvider {
    config: KeycloakConfig,
}

impl KeycloakAuthProvider {
    /// Builds a provider instance from validated Keycloak configuration.
    pub fn new(config: KeycloakConfig) -> Self {
        Self { config }
    }

    /// Returns the configured issuer for startup diagnostics.
    pub fn issuer(&self) -> &str {
        &self.config.issuer
    }

    /// Converts already-verified provider data into MBAM normalized claims.
    ///
    /// Use this after cryptographic verification has completed. Keeping this as a
    /// separate function makes the Keycloak parser testable without business logic.
    pub fn normalize_verified_claims(
        &self,
        principal: AuthenticatedPrincipal,
    ) -> AuthenticatedPrincipal {
        principal
    }

    /// Validates a Keycloak access token and returns normalized MBAM identity claims.
    ///
    /// This scaffold deliberately fails closed until the JWT verifier is wired with
    /// JWKS fetching and claim validation.
    pub fn authenticate_bearer_token<'a>(
        &'a self,
        _bearer_token: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<AuthenticatedPrincipal, AuthProviderError>> + Send + 'a>> {
        Box::pin(async {
            Err(AuthProviderError::ProviderUnavailable(
                "Keycloak verification scaffold is not wired yet".to_string(),
            ))
        })
    }
}
