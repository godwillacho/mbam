use std::{
    collections::{BTreeSet, HashMap},
    time::Duration,
};

use chrono::Utc;
use serde::Deserialize;

use crate::error::ApiError;

/// Runtime settings required to validate Keycloak access tokens.
#[derive(Clone, Debug)]
pub struct KeycloakConfig {
    pub issuer_url: String,
    pub client_id: String,
    pub client_secret: String,
    pub audience: String,
    pub role_client_id: String,
    pub allow_verified_email_linking: bool,
}

/// A verified identity returned by Keycloak token introspection.
#[derive(Clone, Debug)]
pub struct KeycloakIdentity {
    pub subject: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub roles: BTreeSet<String>,
}

/// Validates access tokens against Keycloak's confidential-client introspection endpoint.
#[derive(Clone)]
pub struct KeycloakAuthenticator {
    client: reqwest::Client,
    config: KeycloakConfig,
}

#[derive(Debug, Deserialize)]
struct IntrospectionResponse {
    active: bool,
    sub: Option<String>,
    email: Option<String>,
    #[serde(default)]
    email_verified: bool,
    iss: Option<String>,
    exp: Option<i64>,
    aud: Option<AudienceClaim>,
    #[serde(default)]
    realm_access: RoleContainer,
    #[serde(default)]
    resource_access: HashMap<String, RoleContainer>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AudienceClaim {
    One(String),
    Many(Vec<String>),
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RoleContainer {
    #[serde(default)]
    roles: Vec<String>,
}

impl KeycloakAuthenticator {
    /// Creates a reusable Keycloak introspection client with a bounded timeout.
    ///
    /// Input is fully validated Keycloak configuration and output is a reusable
    /// authenticator. HTTP-client construction is expected to succeed for static
    /// settings and panics only if the client builder itself is invalid. This
    /// function does not contact Keycloak, validate a token, or authorize Mbam
    /// memberships and resources.
    pub fn new(config: KeycloakConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .expect("Keycloak HTTP client configuration must be valid");
        Self { client, config }
    }

    /// Introspects a bearer token and returns only validated identity claims.
    ///
    /// Input is the opaque bearer-token value and output is the stable subject,
    /// optional verified-email migration data, and asserted role set. Keycloak
    /// must report the token active and Mbam additionally requires the configured
    /// API audience and non-empty subject. Network, timeout, response, claim, or
    /// status failures return `401`. This function does not map the subject to a
    /// local user or authorize local memberships, permissions, or scope.
    pub async fn authenticate(&self, token: &str) -> Result<KeycloakIdentity, ApiError> {
        let endpoint = format!(
            "{}/protocol/openid-connect/token/introspect",
            self.config.issuer_url.trim_end_matches('/'),
        );
        let response = self
            .client
            .post(endpoint)
            .basic_auth(&self.config.client_id, Some(&self.config.client_secret))
            .form(&[("token", token)])
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(error = %error, "Keycloak introspection request failed");
                ApiError::Unauthorized
            })?;

        if !response.status().is_success() {
            tracing::warn!(status = %response.status(), "Keycloak introspection rejected the request");
            return Err(ApiError::Unauthorized);
        }

        let claims = response
            .json::<IntrospectionResponse>()
            .await
            .map_err(|_| ApiError::Unauthorized)?;
        if !claims.active
            || !issuer_matches(claims.iss.as_deref(), &self.config.issuer_url)
            || !expiration_is_current(claims.exp, Utc::now().timestamp())
            || !audience_contains(claims.aud.as_ref(), &self.config.audience)
        {
            return Err(ApiError::Unauthorized);
        }

        let subject = claims
            .sub
            .filter(|value| !value.trim().is_empty())
            .ok_or(ApiError::Unauthorized)?;
        let mut roles = claims
            .realm_access
            .roles
            .into_iter()
            .collect::<BTreeSet<_>>();
        if let Some(client_roles) = claims.resource_access.get(&self.config.role_client_id) {
            roles.extend(client_roles.roles.iter().cloned());
        }

        Ok(KeycloakIdentity {
            subject,
            email: claims.email,
            email_verified: claims.email_verified,
            roles,
        })
    }

    /// Returns whether controlled migration-time verified-email linking is enabled.
    ///
    /// The method has no input beyond immutable authenticator configuration and
    /// outputs the configured boolean. It cannot fail and assumes startup
    /// validation already completed. It does not link an identity or authorize
    /// any request.
    pub fn allow_verified_email_linking(&self) -> bool {
        self.config.allow_verified_email_linking
    }
}

/// Checks whether a scalar or array audience claim contains the API audience.
fn audience_contains(audience: Option<&AudienceClaim>, expected: &str) -> bool {
    match audience {
        Some(AudienceClaim::One(value)) => value == expected,
        Some(AudienceClaim::Many(values)) => values.iter().any(|value| value == expected),
        None => false,
    }
}

/// Requires the introspected issuer to match the configured realm issuer.
fn issuer_matches(issuer: Option<&str>, expected: &str) -> bool {
    issuer.is_some_and(|value| value.trim_end_matches('/') == expected.trim_end_matches('/'))
}

/// Requires a present expiration timestamp strictly later than the current time.
fn expiration_is_current(expires_at: Option<i64>, now: i64) -> bool {
    expires_at.is_some_and(|value| value > now)
}

#[cfg(test)]
mod tests {
    use super::{audience_contains, expiration_is_current, issuer_matches, AudienceClaim};

    /// Verifies strict audience matching for scalar and array token claims.
    #[test]
    fn validates_expected_audience() {
        assert!(audience_contains(
            Some(&AudienceClaim::One("mbam-api".into())),
            "mbam-api"
        ));
        assert!(audience_contains(
            Some(&AudienceClaim::Many(vec![
                "account".into(),
                "mbam-api".into()
            ])),
            "mbam-api",
        ));
        assert!(!audience_contains(
            Some(&AudienceClaim::One("other".into())),
            "mbam-api"
        ));
        assert!(!audience_contains(None, "mbam-api"));
    }

    /// Verifies exact realm issuer matching with harmless trailing-slash normalization.
    #[test]
    fn validates_expected_issuer() {
        assert!(issuer_matches(
            Some("https://identity.example/realms/mbam"),
            "https://identity.example/realms/mbam/"
        ));
        assert!(!issuer_matches(
            Some("https://identity.example/realms/other"),
            "https://identity.example/realms/mbam"
        ));
        assert!(!issuer_matches(
            None,
            "https://identity.example/realms/mbam"
        ));
    }

    /// Verifies that missing, current, and expired timestamps fail closed.
    #[test]
    fn validates_expiration_claim() {
        assert!(expiration_is_current(Some(101), 100));
        assert!(!expiration_is_current(Some(100), 100));
        assert!(!expiration_is_current(Some(99), 100));
        assert!(!expiration_is_current(None, 100));
    }
}
