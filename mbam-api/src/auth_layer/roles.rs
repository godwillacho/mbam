use std::collections::HashSet;

use super::claims::AuthenticatedPrincipal;

/// MBAM baseline roles.
///
/// Every authenticated user must resolve to exactly one baseline role before custom
/// permission clauses are considered. This prevents an unanchored custom role from
/// accidentally inheriting more access than intended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BaselineRole {
    MasterOwner,
    BusinessAdmin,
    ShopManager,
    Cashier,
}

impl BaselineRole {
    /// Returns the canonical MBAM role code used by downstream membership logic.
    pub fn as_code(self) -> &'static str {
        match self {
            Self::MasterOwner => "master_owner",
            Self::BusinessAdmin => "business_admin",
            Self::ShopManager => "shop_manager",
            Self::Cashier => "cashier",
        }
    }

    /// Returns the baseline dashboard view associated with the role.
    ///
    /// Custom permissions may add extra dashboards, but must not replace this baseline.
    pub fn baseline_dashboard_view(self) -> &'static str {
        match self {
            Self::MasterOwner => "master",
            Self::BusinessAdmin => "business",
            Self::ShopManager => "shop",
            Self::Cashier => "personal",
        }
    }
}

/// Result of mapping provider roles into MBAM authorization rules.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoleMapping {
    /// The required baseline role resolved from Keycloak roles.
    pub baseline: BaselineRole,
    /// Additive permission/open-clause codes. These must never remove or replace baseline rules.
    pub custom_permissions: HashSet<String>,
}

/// Maps validated Keycloak roles and scopes into MBAM baseline + additive permissions.
///
/// This function fails closed by returning `None` when no exactly one baseline role is found.
/// The API should treat `None` as forbidden, not as master or custom access.
pub fn map_principal_to_role(principal: &AuthenticatedPrincipal) -> Option<RoleMapping> {
    let baseline = resolve_baseline_role(principal)?;
    let custom_permissions = principal
        .permissions
        .iter()
        .filter(|permission| !permission.trim().is_empty())
        .cloned()
        .collect();

    Some(RoleMapping {
        baseline,
        custom_permissions,
    })
}

/// Resolves the baseline role from provider roles.
///
/// Exactly one baseline role must be present. If zero or multiple baselines are present,
/// the function returns `None` so the API can deny access instead of guessing.
pub fn resolve_baseline_role(principal: &AuthenticatedPrincipal) -> Option<BaselineRole> {
    let mut matches = Vec::new();

    if principal.has_role("mbam_master_owner") {
        matches.push(BaselineRole::MasterOwner);
    }
    if principal.has_role("mbam_business_admin") {
        matches.push(BaselineRole::BusinessAdmin);
    }
    if principal.has_role("mbam_shop_manager") {
        matches.push(BaselineRole::ShopManager);
    }
    if principal.has_role("mbam_cashier") {
        matches.push(BaselineRole::Cashier);
    }

    if matches.len() == 1 {
        matches.first().copied()
    } else {
        None
    }
}
