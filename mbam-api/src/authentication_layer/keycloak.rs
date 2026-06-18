use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

/// Keycloak runtime settings used by the API authentication boundary.
///
/// The values should come from environment variables once the live route guards
/// are switched from local Mbam JWTs to Keycloak-issued access tokens.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KeycloakConfig {
    pub issuer: String,
    pub audience: String,
    pub jwks_url: String,
    pub client_id: String,
}

impl KeycloakConfig {
    /// Builds the OpenID Connect discovery URL for the configured realm issuer.
    ///
    /// Use this when adding automatic JWKS discovery instead of hardcoding the
    /// `KEYCLOAK_JWKS_URL` value. The function does not call the network; it only
    /// derives the standard URL path from the issuer.
    pub fn discovery_url(&self) -> String {
        format!(
            "{}/.well-known/openid-configuration",
            self.issuer.trim_end_matches('/')
        )
    }
}

/// Minimal Keycloak claims consumed by Mbam authorization.
///
/// Keycloak can emit many more claims. Keep this struct intentionally narrow so
/// route guards use only stable identity and role inputs.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct KeycloakClaims {
    pub sub: String,
    pub email: Option<String>,
    pub preferred_username: Option<String>,
    pub name: Option<String>,
    pub realm_access: Option<KeycloakRealmAccess>,
    pub resource_access: Option<serde_json::Value>,
}

/// Realm role wrapper from the standard Keycloak token shape.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct KeycloakRealmAccess {
    pub roles: Vec<String>,
}

/// Baseline role families supported by Mbam.
///
/// Custom roles must always anchor to one of these baseline roles. Extra Keycloak
/// roles only add open clauses; they must never replace the baseline.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BaselineRole {
    MasterOwner,
    BusinessAdmin,
    ShopManager,
    Cashier,
}

/// API principal produced after Keycloak token validation.
///
/// Route handlers should use this shape instead of reading raw token claims.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthenticatedPrincipal {
    pub subject: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub baseline_role: Option<BaselineRole>,
    pub permissions: BTreeSet<String>,
}

/// Errors returned by the Keycloak authentication layer.
#[derive(Debug, thiserror::Error)]
pub enum KeycloakAuthError {
    #[error("authorization header is missing or is not a bearer token")]
    MissingBearerToken,
    #[error("keycloak token verification is not configured")]
    NotConfigured,
    #[error("keycloak token is invalid")]
    InvalidToken,
}

/// Extracts a bearer token from an HTTP Authorization header value.
///
/// Use this in route guards before calling `verify_keycloak_access_token`. Keeping
/// extraction here makes the live routes consistent and prevents each handler
/// from accepting slightly different header formats.
pub fn extract_bearer_token(authorization: &str) -> Result<&str, KeycloakAuthError> {
    authorization
        .trim()
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .ok_or(KeycloakAuthError::MissingBearerToken)
}

/// Verifies a Keycloak access token and maps it into an authenticated principal.
///
/// This function is the intended live replacement for local JWT verification in
/// route handlers. The implementation currently fails closed until the realm
/// issuer, audience, and JWKS verification are configured. Do not decode tokens
/// without signature validation here; doing so would make the API trust data the
/// browser can forge.
pub async fn verify_keycloak_access_token(
    _token: &str,
    _config: &KeycloakConfig,
) -> Result<AuthenticatedPrincipal, KeycloakAuthError> {
    Err(KeycloakAuthError::NotConfigured)
}

/// Converts verified Keycloak claims into Mbam's principal shape.
///
/// Call this only after the token signature, issuer, audience, and expiry have
/// been validated. It keeps role mapping deterministic and fail-closed.
pub fn principal_from_verified_claims(claims: KeycloakClaims) -> AuthenticatedPrincipal {
    let roles = collect_realm_roles(&claims);
    let baseline_role = baseline_from_roles(&roles);
    let permissions = permissions_from_roles(&roles, baseline_role);

    AuthenticatedPrincipal {
        subject: claims.sub,
        email: claims.email,
        display_name: claims.name.or(claims.preferred_username),
        baseline_role,
        permissions,
    }
}

/// Reads realm roles from verified Keycloak claims.
///
/// Resource/client roles can be added later, but realm roles are enough for the
/// baseline migration and keep the first cut simple.
pub fn collect_realm_roles(claims: &KeycloakClaims) -> BTreeSet<String> {
    claims
        .realm_access
        .as_ref()
        .map(|access| access.roles.iter().cloned().collect())
        .unwrap_or_default()
}

/// Selects the least-privilege baseline role from Keycloak roles.
///
/// This function intentionally returns `None` when no known baseline role is
/// present. Unknown/custom roles must not imply access unless they also carry an
/// explicit baseline role.
pub fn baseline_from_roles(roles: &BTreeSet<String>) -> Option<BaselineRole> {
    if roles.contains("mbam_master_owner") {
        Some(BaselineRole::MasterOwner)
    } else if roles.contains("mbam_business_admin") {
        Some(BaselineRole::BusinessAdmin)
    } else if roles.contains("mbam_shop_manager") {
        Some(BaselineRole::ShopManager)
    } else if roles.contains("mbam_cashier") {
        Some(BaselineRole::Cashier)
    } else {
        None
    }
}

/// Builds Mbam permission open clauses from Keycloak roles.
///
/// Baseline permissions are always added from the baseline role. Extra Keycloak
/// roles only add permissions on top of the baseline and never broaden the scope
/// by themselves.
pub fn permissions_from_roles(
    roles: &BTreeSet<String>,
    baseline_role: Option<BaselineRole>,
) -> BTreeSet<String> {
    let mut permissions = BTreeSet::new();

    match baseline_role {
        Some(BaselineRole::MasterOwner) => {
            permissions.extend([
                "screen.dashboard.master",
                "screen.businesses",
                "screen.products",
                "screen.record_transaction",
                "screen.reports",
                "screen.team",
                "screen.transactions",
                "product.create",
                "product.update",
                "worker.invite",
                "worker.update",
            ].map(String::from));
        }
        Some(BaselineRole::BusinessAdmin) => {
            permissions.extend([
                "screen.dashboard.business",
                "screen.businesses",
                "screen.products",
                "screen.reports",
                "screen.team",
                "screen.transactions",
                "product.create",
                "product.update",
                "worker.invite",
                "worker.update",
            ].map(String::from));
        }
        Some(BaselineRole::ShopManager) => {
            permissions.extend([
                "screen.dashboard.shop",
                "screen.products",
                "screen.record_transaction",
                "screen.reports",
                "screen.transactions",
                "product.create",
                "product.update",
            ].map(String::from));
        }
        Some(BaselineRole::Cashier) => {
            permissions.extend([
                "screen.dashboard.personal",
                "screen.products",
                "screen.record_transaction",
                "screen.transaction_drafts",
                "screen.transactions",
                "product.create",
                "product.update",
            ].map(String::from));
        }
        None => {}
    }

    if roles.contains("mbam_open_reports") {
        permissions.insert("screen.reports".to_string());
    }
    if roles.contains("mbam_open_team") {
        permissions.insert("screen.team".to_string());
        permissions.insert("worker.invite".to_string());
        permissions.insert("worker.update".to_string());
    }
    if roles.contains("mbam_open_business_structure") {
        permissions.insert("screen.businesses".to_string());
    }

    permissions
}

/// Checks whether a verified principal can execute a specific permission.
///
/// Route handlers should use this after token validation and database scope
/// checks. This helper only answers whether the identity carries the permission;
/// it does not validate business or unit ownership.
pub fn has_permission(principal: &AuthenticatedPrincipal, permission: &str) -> bool {
    principal.permissions.contains(permission)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_roles_fail_closed() {
        let roles = BTreeSet::from(["random_custom_role".to_string()]);
        assert_eq!(baseline_from_roles(&roles), None);
        assert!(permissions_from_roles(&roles, None).is_empty());
    }

    #[test]
    fn custom_permissions_extend_cashier_baseline_only() {
        let roles = BTreeSet::from([
            "mbam_cashier".to_string(),
            "mbam_open_reports".to_string(),
        ]);
        let baseline = baseline_from_roles(&roles);
        let permissions = permissions_from_roles(&roles, baseline);
        assert_eq!(baseline, Some(BaselineRole::Cashier));
        assert!(permissions.contains("screen.dashboard.personal"));
        assert!(permissions.contains("screen.reports"));
        assert!(!permissions.contains("screen.dashboard.master"));
    }
}
