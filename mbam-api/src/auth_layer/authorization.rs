use super::roles::{BaselineRole, RoleMapping};

/// A normalized authorization decision for API services.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizationDecision {
    /// Required baseline role for the current authenticated principal.
    pub baseline: BaselineRole,
    /// Additive permission codes opened on top of the baseline.
    pub permissions: Vec<String>,
}

impl AuthorizationDecision {
    /// Creates a decision from a mapped baseline role and additive permissions.
    ///
    /// Use this after identity-provider roles have been validated and mapped. This
    /// function does not perform database membership checks; service code must still
    /// load business and business-unit scope before returning data.
    pub fn from_role_mapping(mapping: RoleMapping) -> Self {
        Self {
            baseline: mapping.baseline,
            permissions: mapping.custom_permissions.into_iter().collect(),
        }
    }

    /// Returns true when the additive permission set contains the requested code.
    ///
    /// This helper should only open extra actions. It must not be used to replace
    /// the baseline role check.
    pub fn opens_permission(&self, permission: &str) -> bool {
        self.permissions.iter().any(|item| item == permission)
    }
}
