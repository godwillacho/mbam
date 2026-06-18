use std::{
    collections::{BTreeSet, HashMap},
    time::Duration,
};

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
    /// Creates a reusable Keycloak client with a bounded authentication timeout.
    pub fn new(config: KeycloakConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .expect("Keycloak HTTP client configuration must be valid");
        Self { client, config }
    }

    /// Introspects a bearer token and returns only validated identity claims.
    ///
    /// The token must be active, contain the configured API audience, and expose
    /// a stable subject. Roles are collected from both realm roles and the
    /// configured Keycloak client role namespace.
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

        let claims = response.json::<IntrospectionResponse>().await.map_err(|_| ApiError::Unauthorized)?;
        if !claims.active || !audience_contains(claims.aud.as_ref(), &self.config.audience) {
            return Err(ApiError::Unauthorized);
        }

        let subject = claims.sub.filter(|value| !value.trim().is_empty()).ok_or(ApiError::Unauthorized)?;
        let mut roles = claims.realm_access.roles.into_iter().collect::<BTreeSet<_>>();
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

    /// Returns whether migration-time linking by verified email is enabled.
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

#[cfg(test)]
mod tests {
    use super::{audience_contains, AudienceClaim};

    /// Verifies strict audience matching for scalar and array token claims.
    #[test]
    fn validates_expected_audience() {
        assert!(audience_contains(Some(&AudienceClaim::One("mbam-api".into())), "mbam-api"));
        assert!(audience_contains(
            Some(&AudienceClaim::Many(vec!["account".into(), "mbam-api".into()])),
            "mbam-api",
        ));
        assert!(!audience_contains(Some(&AudienceClaim::One("other".into())), "mbam-api"));
        assert!(!audience_contains(None, "mbam-api"));
    }
}
