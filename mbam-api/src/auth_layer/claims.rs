use std::collections::HashSet;

/// Normalized authenticated identity used by MBAM after a provider validates a token.
///
/// Keycloak-specific claim names should not leak through the rest of the API.
/// Convert them into this shape first, then use application services to resolve
/// business accounts, business units, dashboard profiles, and offline sync scope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedPrincipal {
    /// Stable identity-provider subject. For Keycloak this is the JWT `sub` claim.
    pub subject: String,
    /// Login email from the provider token. This is useful for display and migration,
    /// but authorization should rely on the subject and membership mappings.
    pub email: Option<String>,
    /// Human-readable display name from token claims such as `name` or `preferred_username`.
    pub display_name: Option<String>,
    /// Raw realm/client roles extracted from the provider token.
    pub roles: HashSet<String>,
    /// Raw permission-like scopes extracted from roles, groups, or custom claims.
    pub permissions: HashSet<String>,
}

impl AuthenticatedPrincipal {
    /// Creates a normalized principal from provider-validated identity data.
    ///
    /// Use this after token signature, issuer, audience, and expiry checks have passed.
    pub fn new(
        subject: impl Into<String>,
        email: Option<String>,
        display_name: Option<String>,
        roles: HashSet<String>,
        permissions: HashSet<String>,
    ) -> Self {
        Self {
            subject: subject.into(),
            email,
            display_name,
            roles,
            permissions,
        }
    }

    /// Returns true when the validated token contains a role with the exact provider role name.
    ///
    /// This helper is intentionally exact-match only. Do not use substring matching for roles.
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.contains(role)
    }

    /// Returns true when the validated token contains a permission/open-clause code.
    ///
    /// These permissions are additive. They must not replace the baseline role decision.
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.contains(permission)
    }
}
