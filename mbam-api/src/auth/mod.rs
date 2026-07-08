//! Central authentication boundary for the Mbam API.
//!
//! Everything under this module answers "how do we know who is calling."
//! Business and shop scope authorization remains in the domain services and
//! database memberships (see `AuthorizationContext`'s `require_*` methods).
//!
//! Layout (see `README.md` for the full breakdown):
//! - `context`, `keycloak`, `principal`, `identity_repository` (private) plus
//!   this file's `AuthenticationLayer` -- Keycloak/legacy-JWT token
//!   verification and the `AuthorizationContext`/`AuthenticatedPrincipal`
//!   extractors used by every protected route handler.
//! - `password`, `tokens` (public) -- Argon2 password hashing and
//!   access/refresh/offline-grant token issuance and verification.
//! - `legacy` (public) -- HTTP handlers/service/repository for signup, login,
//!   refresh, logout, OAuth, password reset, and offline grants: the
//!   non-Keycloak auth provider, mounted at `/api/v1/auth` only when
//!   `AUTH_PROVIDER=legacy` (see `routes::app_router`).

mod context;
mod identity_repository;
mod keycloak;
mod principal;

pub mod legacy;
pub mod password;
pub mod tokens;

use axum::http::HeaderMap;
use sqlx::PgPool;

use crate::{config::Config, error::ApiError};

pub use context::{AuthorizationContext, BaselineRole};
pub use principal::AuthenticatedPrincipal;

use keycloak::{KeycloakAuthenticator, KeycloakConfig};
use principal::bearer_token;

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
    /// Builds the configured authentication provider from validated runtime settings.
    ///
    /// Input is the typed application configuration and output is one immutable
    /// authentication layer. Unsupported providers or missing Keycloak settings
    /// return a startup error so the API never accepts traffic in a partial
    /// security mode. This function does not validate a request, connect to
    /// Keycloak, or authorize business data.
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
                        role_client_id: config.keycloak_role_client_id.clone().unwrap_or_else(
                            || {
                                config
                                    .keycloak_client_id
                                    .clone()
                                    .unwrap_or_else(|| "mbam-api".to_string())
                            },
                        ),
                        allow_verified_email_linking: config.keycloak_allow_email_linking,
                    },
                )),
            }),
            value => Err(format!("unsupported AUTH_PROVIDER: {value}")),
        }
    }

    /// Authenticates an HTTP request and resolves it to a local Mbam identity.
    ///
    /// Inputs are request headers and the database pool; output is a verified
    /// principal containing the local user ID and, in Keycloak mode, immutable
    /// subject and asserted roles. Missing, invalid, inactive, wrongly scoped, or
    /// unmapped tokens return `401` and never fall back to another provider.
    /// This function intentionally does not require active membership or
    /// authorize permissions and scope; `authorize` performs that next step.
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
                    keycloak_subject: None,
                    asserted_keycloak_roles: None,
                })
            }
            AuthenticationProvider::Keycloak(authenticator) => {
                let identity = authenticator.authenticate(token).await?;
                let user_id = identity_repository::resolve_keycloak_user(
                    db,
                    &identity.subject,
                    identity.email.as_deref(),
                    identity.email_verified,
                    authenticator.allow_verified_email_linking(),
                )
                .await?;
                Ok(AuthenticatedPrincipal {
                    user_id,
                    keycloak_subject: Some(identity.subject),
                    asserted_keycloak_roles: Some(identity.roles),
                })
            }
        }
    }

    /// Authenticates a request and returns the normalized Mbam authorization context.
    ///
    /// Inputs are request headers and the database pool; output contains the
    /// verified identity, one local baseline role, active memberships,
    /// permissions, scopes, and authorization version. Invalid tokens, inactive
    /// users, missing memberships, unknown roles, and Keycloak/Mbam role
    /// mismatches return `401`. This function does not authorize any particular
    /// domain operation; routes and services must still apply permission, scope,
    /// and ownership checks.
    pub async fn authorize(
        &self,
        headers: &HeaderMap,
        db: &PgPool,
    ) -> Result<AuthorizationContext, ApiError> {
        let principal = self.authenticate(headers, db).await?;
        let user = identity_repository::authorization_user(db, principal.user_id).await?;
        let grants = identity_repository::authorization_grants(db, principal.user_id).await?;
        AuthorizationContext::new(
            user.id,
            principal.keycloak_subject,
            user.full_name,
            user.email,
            user.authorization_version,
            grants,
            principal.asserted_keycloak_roles.as_ref(),
        )
    }
}

/// Reads a mandatory Keycloak setting and returns a startup-safe error when missing.
fn required(value: &Option<String>, name: &str) -> Result<String, String> {
    value
        .clone()
        .ok_or_else(|| format!("{name} is required when AUTH_PROVIDER=keycloak"))
}

#[cfg(test)]
mod tests {
    use super::BaselineRole;

    #[test]
    fn normalizes_only_recognized_local_role_baselines() {
        assert_eq!(
            BaselineRole::from_local_role_code("cashier"),
            Some(BaselineRole::Cashier)
        );
        assert_eq!(
            BaselineRole::from_local_role_code("custom_member_shop_manager_senior"),
            Some(BaselineRole::ShopManager)
        );
        assert_eq!(BaselineRole::from_local_role_code("unknown"), None);
    }
}
