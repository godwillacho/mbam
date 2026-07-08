use std::collections::BTreeSet;

use axum::{extract::FromRequestParts, http::request::Parts};
use serde::Serialize;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

const BASELINE_ROLE_CODES: [&str; 4] =
    ["master_owner", "business_admin", "shop_manager", "cashier"];

/// A recognized least-privilege application role asserted by Keycloak and Mbam.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BaselineRole {
    MasterOwner,
    BusinessAdmin,
    ShopManager,
    Cashier,
}

impl BaselineRole {
    /// Returns the stable role code used by Keycloak, Mbam roles, and API responses.
    ///
    /// Input is the validated enum value and output is a static role code.
    /// The method assumes construction already rejected unknown roles, cannot
    /// fail, and does not grant any permission or resource scope by itself.
    pub fn code(self) -> &'static str {
        match self {
            Self::MasterOwner => "master_owner",
            Self::BusinessAdmin => "business_admin",
            Self::ShopManager => "shop_manager",
            Self::Cashier => "cashier",
        }
    }

    /// Parses a local standard or per-member custom role into its baseline.
    ///
    /// Input is an Mbam role code and output is a recognized baseline role.
    /// Custom roles must encode one known baseline in their immutable prefix.
    /// Unknown or ambiguous values return `None`; this function does not inspect
    /// memberships, token claims, permissions, or resource scope.
    pub fn from_local_role_code(role_code: &str) -> Option<Self> {
        let normalized = role_code
            .strip_prefix("custom_member_")
            .unwrap_or(role_code);
        BASELINE_ROLE_CODES.iter().find_map(|baseline| {
            if normalized == *baseline || normalized.starts_with(&format!("{baseline}_")) {
                Self::from_baseline_code(baseline)
            } else {
                None
            }
        })
    }

    /// Parses an exact Keycloak baseline-role claim.
    ///
    /// Input is one token role string and output is a recognized baseline role.
    /// Only exact baseline claims are accepted; custom Keycloak claims are not
    /// treated as Mbam permissions. Unknown values return `None`, and this
    /// function does not validate the token or local membership state.
    pub fn from_keycloak_role(role_code: &str) -> Option<Self> {
        Self::from_baseline_code(role_code)
    }

    fn from_baseline_code(role_code: &str) -> Option<Self> {
        match role_code {
            "master_owner" => Some(Self::MasterOwner),
            "business_admin" => Some(Self::BusinessAdmin),
            "shop_manager" => Some(Self::ShopManager),
            "cashier" => Some(Self::Cashier),
            _ => None,
        }
    }
}

/// One membership-scoped authorization grant loaded from Mbam.
#[derive(Clone, Debug)]
pub struct AuthorizationGrant {
    pub membership_id: Uuid,
    pub business_account_id: Uuid,
    pub baseline_role: BaselineRole,
    pub permissions: BTreeSet<String>,
    pub business_ids: BTreeSet<Uuid>,
    pub business_unit_ids: BTreeSet<Uuid>,
}

/// One permission-bearing authorization scope safe for offline reconciliation.
#[derive(Clone, Debug)]
pub struct AuthorizationScopeSnapshot {
    pub business_ids: BTreeSet<Uuid>,
    pub business_unit_ids: BTreeSet<Uuid>,
    pub permissions: BTreeSet<String>,
    pub restrict_to_own_records: bool,
}

/// The normalized, fail-closed authorization context for one protected request.
#[derive(Clone, Debug)]
pub struct AuthorizationContext {
    pub user_id: Uuid,
    pub keycloak_subject: Option<String>,
    pub full_name: String,
    pub email: String,
    pub baseline_role: BaselineRole,
    pub permissions: BTreeSet<String>,
    pub active_membership_ids: BTreeSet<Uuid>,
    pub authorized_business_account_ids: BTreeSet<Uuid>,
    pub authorized_business_ids: BTreeSet<Uuid>,
    pub authorized_business_unit_ids: BTreeSet<Uuid>,
    pub authorization_version: i64,
    grants: Vec<AuthorizationGrant>,
}

impl AuthorizationContext {
    /// Creates a normalized context from an authenticated identity and local grants.
    ///
    /// Inputs are immutable identity fields, active Mbam grants, and the current
    /// authorization version; output is a context whose top-level sets are safe
    /// unions for display and bootstrap responses. All grants must share exactly
    /// one recognized baseline role or authentication fails with `401`. This
    /// constructor does not validate token cryptography or authorize a domain
    /// operation; scope-sensitive checks must use the guard methods below.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        user_id: Uuid,
        keycloak_subject: Option<String>,
        full_name: String,
        email: String,
        authorization_version: i64,
        grants: Vec<AuthorizationGrant>,
        asserted_keycloak_roles: Option<&BTreeSet<String>>,
    ) -> Result<Self, ApiError> {
        let baseline_role = single_local_baseline(&grants)?;
        if let Some(asserted_roles) = asserted_keycloak_roles {
            let asserted_baseline = single_keycloak_baseline(asserted_roles)?;
            if asserted_baseline != baseline_role {
                return Err(ApiError::Unauthorized);
            }
        }

        let mut permissions = BTreeSet::new();
        let mut active_membership_ids = BTreeSet::new();
        let mut authorized_business_account_ids = BTreeSet::new();
        let mut authorized_business_ids = BTreeSet::new();
        let mut authorized_business_unit_ids = BTreeSet::new();
        for grant in &grants {
            permissions.extend(grant.permissions.iter().cloned());
            active_membership_ids.insert(grant.membership_id);
            authorized_business_account_ids.insert(grant.business_account_id);
            authorized_business_ids.extend(grant.business_ids.iter().copied());
            authorized_business_unit_ids.extend(grant.business_unit_ids.iter().copied());
        }

        Ok(Self {
            user_id,
            keycloak_subject,
            full_name,
            email,
            baseline_role,
            permissions,
            active_membership_ids,
            authorized_business_account_ids,
            authorized_business_ids,
            authorized_business_unit_ids,
            authorization_version,
            grants,
        })
    }

    /// Requires one of the supplied baseline roles.
    ///
    /// Input is the allowed-role set and output is `Ok(())` for a matching
    /// authenticated context. A recognized user with another baseline receives
    /// `403`. This guard does not check permissions, tenant scope, ownership, or
    /// whether a particular resource exists.
    pub fn require_baseline_role(&self, allowed: &[BaselineRole]) -> Result<(), ApiError> {
        if allowed.contains(&self.baseline_role) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }

    /// Requires an effective permission on at least one active membership.
    ///
    /// Input is a domain permission code and output is `Ok(())` when any grant
    /// contains it. Missing permissions return `403`. This guard intentionally
    /// does not authorize a business or unit; scoped operations must use a
    /// scope-aware guard to avoid combining unrelated grants.
    pub fn require_permission(&self, permission: &str) -> Result<(), ApiError> {
        if self
            .grants
            .iter()
            .any(|grant| grant.permissions.contains(permission))
        {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }

    /// Returns business IDs authorized by grants containing one permission.
    ///
    /// Input is a domain permission and output is the union of business IDs from
    /// grants that contain that same permission. Empty output means no scoped
    /// access. This method assumes the context was normalized and does not load
    /// resource state, authorize a unit, or perform a domain operation.
    pub fn business_ids_for_permission(&self, permission: &str) -> BTreeSet<Uuid> {
        self.grants
            .iter()
            .filter(|grant| grant.permissions.contains(permission))
            .flat_map(|grant| grant.business_ids.iter().copied())
            .collect()
    }

    /// Returns unit IDs authorized by grants containing one permission.
    ///
    /// Input is a domain permission and output is the union of business-unit IDs
    /// from grants that contain that same permission. Empty output means no
    /// scoped access. This method does not infer access from another membership
    /// or authorize the requested operation by itself.
    pub fn business_unit_ids_for_permission(&self, permission: &str) -> BTreeSet<Uuid> {
        self.grants
            .iter()
            .filter(|grant| grant.permissions.contains(permission))
            .flat_map(|grant| grant.business_unit_ids.iter().copied())
            .collect()
    }

    /// Returns membership scopes that contain the requested permission.
    ///
    /// Input is a permission code and output preserves each matching
    /// membership's business IDs, unit IDs, complete permission set, and cashier
    /// ownership restriction. Empty output means no access. This method is for
    /// offline reconciliation and does not authorize a queued operation by
    /// itself.
    pub fn scopes_for_permission(&self, permission: &str) -> Vec<AuthorizationScopeSnapshot> {
        self.grants
            .iter()
            .filter(|grant| grant.permissions.contains(permission))
            .map(|grant| AuthorizationScopeSnapshot {
                business_ids: grant.business_ids.clone(),
                business_unit_ids: grant.business_unit_ids.clone(),
                permissions: grant.permissions.clone(),
                restrict_to_own_records: grant.baseline_role == BaselineRole::Cashier,
            })
            .collect()
    }

    /// Requires a permission and business scope on the same active membership.
    ///
    /// Inputs are a permission code and business identifier. Output is
    /// `Ok(())` only when one grant contains both. Missing or cross-tenant scope
    /// returns `404` to avoid leaking resource existence. This guard does not
    /// load the business or perform the requested domain mutation.
    pub fn require_business(&self, permission: &str, business_id: Uuid) -> Result<(), ApiError> {
        if self.grants.iter().any(|grant| {
            grant.permissions.contains(permission) && grant.business_ids.contains(&business_id)
        }) {
            Ok(())
        } else {
            Err(ApiError::NotFound)
        }
    }

    /// Requires a permission and business-unit scope on the same active membership.
    ///
    /// Inputs are a permission code and unit identifier. Output is `Ok(())`
    /// only for a same-grant match. Missing or cross-tenant scope returns `404`
    /// to avoid leaking another tenant's unit. This guard does not load the
    /// unit, verify its current status, or perform a domain operation.
    pub fn require_business_unit(
        &self,
        permission: &str,
        business_unit_id: Uuid,
    ) -> Result<(), ApiError> {
        if self.grants.iter().any(|grant| {
            grant.permissions.contains(permission)
                && grant.business_unit_ids.contains(&business_unit_id)
        }) {
            Ok(())
        } else {
            Err(ApiError::NotFound)
        }
    }

    /// Requires permission, business, and unit scope on the same membership.
    ///
    /// Inputs identify one domain permission and the parent/child scope pair.
    /// Output is `Ok(())` only when one active grant contains all three values.
    /// Cross-grant or out-of-scope combinations return tenant-safe `404`. This
    /// guard does not query whether the unit currently belongs to the business
    /// and does not perform the requested domain operation.
    pub fn require_business_unit_pair(
        &self,
        permission: &str,
        business_id: Uuid,
        business_unit_id: Uuid,
    ) -> Result<(), ApiError> {
        if self.grants.iter().any(|grant| {
            grant.permissions.contains(permission)
                && grant.business_ids.contains(&business_id)
                && grant.business_unit_ids.contains(&business_unit_id)
        }) {
            Ok(())
        } else {
            Err(ApiError::NotFound)
        }
    }

    /// Enforces transaction ownership and scoped transaction visibility.
    ///
    /// Inputs are the transaction owner, business, and optional unit. Cashiers
    /// are allowed only their own transactions and all other roles still need
    /// `sale.view` in the matching scope. Unauthorized access returns `404`.
    /// This guard does not load transaction lines, validate transaction state,
    /// or replace repository-level filtering.
    pub fn require_transaction(
        &self,
        recorded_by_user_id: Uuid,
        business_id: Uuid,
        business_unit_id: Option<Uuid>,
    ) -> Result<(), ApiError> {
        if self.baseline_role == BaselineRole::Cashier && recorded_by_user_id != self.user_id {
            return Err(ApiError::NotFound);
        }
        match business_unit_id {
            Some(unit_id) => self.require_business_unit("sale.view", unit_id),
            None => self.require_business("sale.view", business_id),
        }
    }

    /// Enforces maximum employee-management role and unit boundaries.
    ///
    /// Inputs are the target baseline role plus target business and optional
    /// unit. Shop managers may manage only cashiers in assigned units; business
    /// admins cannot assign master owners; cashiers cannot manage employees.
    /// Denials return `403` or `404` for out-of-scope resources. This guard does
    /// not update Keycloak, write memberships, or provide synchronization.
    pub fn require_employee_management(
        &self,
        target_role: BaselineRole,
        business_id: Uuid,
        business_unit_id: Option<Uuid>,
    ) -> Result<(), ApiError> {
        match self.baseline_role {
            BaselineRole::MasterOwner => {
                if target_role == BaselineRole::MasterOwner {
                    return Err(ApiError::Forbidden);
                }
            }
            BaselineRole::BusinessAdmin => {
                if matches!(
                    target_role,
                    BaselineRole::MasterOwner | BaselineRole::BusinessAdmin
                ) {
                    return Err(ApiError::Forbidden);
                }
            }
            BaselineRole::ShopManager => {
                if target_role != BaselineRole::Cashier {
                    return Err(ApiError::Forbidden);
                }
                let unit_id = business_unit_id.ok_or(ApiError::Forbidden)?;
                self.require_business_unit("worker.update", unit_id)?;
                return Ok(());
            }
            BaselineRole::Cashier => return Err(ApiError::Forbidden),
        }

        match business_unit_id {
            Some(unit_id) => self.require_business_unit("worker.update", unit_id),
            None => self.require_business("worker.update", business_id),
        }
    }
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthorizationContext {
    type Rejection = ApiError;

    /// Extracts and authorizes one protected request through the shared application state.
    ///
    /// Inputs are request headers and the configured API state; output is the
    /// normalized context used by route handlers. Invalid identity or conflicting
    /// role data returns `401`, while storage failures use the central API error.
    /// Extraction authenticates and loads authorization but does not authorize a
    /// particular domain action.
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        state
            .authentication
            .authorize(&parts.headers, &state.db)
            .await
    }
}

fn single_local_baseline(grants: &[AuthorizationGrant]) -> Result<BaselineRole, ApiError> {
    let baselines = grants
        .iter()
        .map(|grant| grant.baseline_role)
        .collect::<BTreeSet<_>>();
    if baselines.len() == 1 {
        Ok(*baselines.first().expect("single baseline exists"))
    } else {
        Err(ApiError::Unauthorized)
    }
}

fn single_keycloak_baseline(asserted_roles: &BTreeSet<String>) -> Result<BaselineRole, ApiError> {
    let baselines = asserted_roles
        .iter()
        .filter_map(|role| BaselineRole::from_keycloak_role(role))
        .collect::<BTreeSet<_>>();
    if baselines.len() == 1 {
        Ok(*baselines.first().expect("single baseline exists"))
    } else {
        Err(ApiError::Unauthorized)
    }
}

#[cfg(test)]
mod tests {
    use super::{AuthorizationContext, AuthorizationGrant, BaselineRole};
    use std::collections::BTreeSet;
    use uuid::Uuid;

    fn grant(
        role: BaselineRole,
        permissions: &[&str],
        business_ids: &[Uuid],
        unit_ids: &[Uuid],
    ) -> AuthorizationGrant {
        AuthorizationGrant {
            membership_id: Uuid::new_v4(),
            business_account_id: Uuid::new_v4(),
            baseline_role: role,
            permissions: permissions.iter().map(|value| value.to_string()).collect(),
            business_ids: business_ids.iter().copied().collect(),
            business_unit_ids: unit_ids.iter().copied().collect(),
        }
    }

    fn context(role: BaselineRole, grants: Vec<AuthorizationGrant>) -> AuthorizationContext {
        AuthorizationContext::new(
            Uuid::new_v4(),
            Some("keycloak-subject".to_string()),
            "Test User".to_string(),
            "test@example.invalid".to_string(),
            2,
            grants,
            Some(&BTreeSet::from([role.code().to_string()])),
        )
        .expect("valid context")
    }

    #[test]
    fn rejects_conflicting_or_missing_keycloak_baselines() {
        let business_id = Uuid::new_v4();
        let grants = vec![grant(
            BaselineRole::ShopManager,
            &["sale.view"],
            &[business_id],
            &[],
        )];

        let missing = AuthorizationContext::new(
            Uuid::new_v4(),
            Some("subject".into()),
            "Manager".into(),
            "manager@example.invalid".into(),
            1,
            grants.clone(),
            Some(&BTreeSet::new()),
        );
        assert!(missing.is_err());

        let conflicting = AuthorizationContext::new(
            Uuid::new_v4(),
            Some("subject".into()),
            "Manager".into(),
            "manager@example.invalid".into(),
            1,
            grants,
            Some(&BTreeSet::from([
                "shop_manager".to_string(),
                "cashier".to_string(),
            ])),
        );
        assert!(conflicting.is_err());
    }

    #[test]
    fn scope_checks_do_not_cross_combine_membership_grants() {
        let allowed_business = Uuid::new_v4();
        let unrelated_business = Uuid::new_v4();
        let authorization = context(
            BaselineRole::BusinessAdmin,
            vec![
                grant(
                    BaselineRole::BusinessAdmin,
                    &["report.view"],
                    &[allowed_business],
                    &[],
                ),
                grant(
                    BaselineRole::BusinessAdmin,
                    &["product.view"],
                    &[unrelated_business],
                    &[],
                ),
            ],
        );

        assert!(authorization
            .require_business("report.view", allowed_business)
            .is_ok());
        assert!(authorization
            .require_business("report.view", unrelated_business)
            .is_err());
    }

    #[test]
    fn shop_managers_can_manage_only_cashiers_in_assigned_units() {
        let business_id = Uuid::new_v4();
        let assigned_unit = Uuid::new_v4();
        let other_unit = Uuid::new_v4();
        let authorization = context(
            BaselineRole::ShopManager,
            vec![grant(
                BaselineRole::ShopManager,
                &["worker.update"],
                &[business_id],
                &[assigned_unit],
            )],
        );

        assert!(authorization
            .require_employee_management(BaselineRole::Cashier, business_id, Some(assigned_unit))
            .is_ok());
        assert!(authorization
            .require_employee_management(
                BaselineRole::ShopManager,
                business_id,
                Some(assigned_unit)
            )
            .is_err());
        assert!(authorization
            .require_employee_management(BaselineRole::Cashier, business_id, Some(other_unit))
            .is_err());
    }

    #[test]
    fn cashiers_cannot_open_another_users_transaction() {
        let business_id = Uuid::new_v4();
        let unit_id = Uuid::new_v4();
        let authorization = context(
            BaselineRole::Cashier,
            vec![grant(
                BaselineRole::Cashier,
                &["sale.view"],
                &[business_id],
                &[unit_id],
            )],
        );

        assert!(authorization
            .require_transaction(authorization.user_id, business_id, Some(unit_id))
            .is_ok());
        assert!(authorization
            .require_transaction(Uuid::new_v4(), business_id, Some(unit_id))
            .is_err());
    }
}
