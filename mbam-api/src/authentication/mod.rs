//! Central authentication boundary for the Mbam API.
//!
//! Identity-provider token validation belongs here. Business and shop scope
//! authorization remains in the domain services and database memberships.

mod keycloak;
mod principal;
mod repository;

use std::collections::BTreeSet;

use axum::http::HeaderMap;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, security::tokens};

pub use principal::AuthenticatedPrincipal;

use keycloak::{KeycloakAuthenticator, KeycloakConfig};
use principal::bearer_token;

const BASELINE_ROLES: [&str; 4] = ["master_owner", "business_admin", "shop_manager", "cashier"];

/// Selects the token validator used by protected API routes.
#[derive(Clone)]
pub struct AuthenticationLayer {
    provider: AuthenticationProvider,
}

#[derive(Clone)]
enum AuthenticationProvider {
    Legacy { jwt_secret: String },
    Keycloak(KeycloakAuthenticator),
}

impl AuthenticationLayer {
    /// Builds the configured authentication provider and rejects incomplete Keycloak settings.
    pub fn from_config(config: &Config) -> Result<Self, String> {
        match config.auth_provider.as_str() {
            "legacy" => Ok(Self {
                provider: AuthenticationProvider::Legacy {
                    jwt_secret: config.jwt_access_secret.clone(),
                },
            }),
            "keycloak" => Ok(Self {
                provider: AuthenticationProvider::Keycloak(KeycloakAuthenticator::new(
                    KeycloakConfig {
                        issuer_url: required(&config.keycloak_issuer_url, "KEYCLOAK_ISSUER_URL")?,
                        client_id: required(&config.keycloak_client_id, "KEYCLOAK_CLIENT_ID")?,
                        client_secret: required(
                            &config.keycloak_client_secret,
                            "KEYCLOAK_CLIENT_SECRET",
                        )?,
                        audience: required(&config.keycloak_audience, "KEYCLOAK_AUDIENCE")?,
                        role_client_id: config
                            .keycloak_role_client_id
                            .clone()
                            .unwrap_or_else(|| {
                                config
                                    .keycloak_client_id
                                    .clone()
                                    .unwrap_or_else(|| "mbam-api".to_string())
                            }),
                        allow_verified_email_linking: config.keycloak_allow_email_linking,
                    },
                )),
            }),
            value => Err(format!("unsupported AUTH_PROVIDER: {value}")),
        }
    }

    /// Authenticates an HTTP request and resolves it to a local Mbam user.
    ///
    /// Keycloak mode requires both a valid external token and a matching active
    /// local membership role. This prevents an identity-provider role from
    /// creating business access without an Mbam membership.
    pub async fn authenticate(
        &self,
        headers: &HeaderMap,
        db: &PgPool,
    ) -> Result<AuthenticatedPrincipal, ApiError> {
        let token = bearer_token(headers)?;
        match &self.provider {
            AuthenticationProvider::Legacy { jwt_secret } => {
                let claims = tokens::verify_access_token(token, jwt_secret)
                    .map_err(|_| ApiError::Unauthorized)?;
                Ok(AuthenticatedPrincipal {
                    user_id: claims.sub,
                    external_subject: claims.sub.to_string(),
                    roles: BTreeSet::new(),
                })
            }
            AuthenticationProvider::Keycloak(authenticator) => {
                let identity = authenticator.authenticate(token).await?;
                let user_id = repository::resolve_keycloak_user(
                    db,
                    &identity.subject,
                    identity.email.as_deref(),
                    identity.email_verified,
                    authenticator.allow_verified_email_linking(),
                )
                .await?;
                let local_roles = repository::active_role_codes(db, user_id).await?;
                if !roles_align(&identity.roles, &local_roles) {
                    tracing::warn!(user_id = %user_id, "Keycloak roles do not match active Mbam membership roles");
                    return Err(ApiError::Unauthorized);
                }
                Ok(AuthenticatedPrincipal {
                    user_id,
                    external_subject: identity.subject,
                    roles: identity.roles,
                })
            }
        }
    }

    /// Authenticates a request and returns the local user identifier expected by domain services.
    pub async fn authenticate_user_id(
        &self,
        headers: &HeaderMap,
        db: &PgPool,
    ) -> Result<Uuid, ApiError> {
        Ok(self.authenticate(headers, db).await?.user_id)
    }
}

/// Reads a mandatory Keycloak setting and returns a startup-safe error when missing.
fn required(value: &Option<String>, name: &str) -> Result<String, String> {
    value.clone().ok_or_else(|| format!("{name} is required when AUTH_PROVIDER=keycloak"))
}

/// Confirms that at least one Keycloak baseline role matches an active local role.
fn roles_align(keycloak_roles: &BTreeSet<String>, local_roles: &[String]) -> bool {
    local_roles.iter().any(|local_role| {
        baseline_role(local_role)
            .map(|role| keycloak_roles.contains(role))
            .unwrap_or(false)
    })
}

/// Reduces a standard or custom local role code to its least-privilege baseline role.
fn baseline_role(role_code: &str) -> Option<&'static str> {
    BASELINE_ROLES.iter().copied().find(|baseline| {
        role_code == *baseline
            || role_code.starts_with(&format!("custom_member_{baseline}_"))
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::{baseline_role, roles_align};

    /// Verifies that custom roles inherit only their encoded baseline role.
    #[test]
    fn normalizes_custom_roles_to_their_baseline() {
        assert_eq!(baseline_role("cashier"), Some("cashier"));
        assert_eq!(
            baseline_role("custom_member_shop_manager_senior"),
            Some("shop_manager"),
        );
        assert_eq!(baseline_role("unknown"), None);
    }

    /// Verifies that Keycloak and local memberships must share a baseline role.
    #[test]
    fn requires_keycloak_and_local_role_alignment() {
        let roles = BTreeSet::from(["cashier".to_string()]);
        assert!(roles_align(&roles, &["cashier".to_string()]));
        assert!(roles_align(
            &roles,
            &["custom_member_cashier_senior".to_string()],
        ));
        assert!(!roles_align(&roles, &["shop_manager".to_string()]));
    }
}
