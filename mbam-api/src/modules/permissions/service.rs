//! Permission business logic.
//!
//! The central permission check function will live here.

use uuid::Uuid;

/// Describes the target resource scope of a permission check.
pub struct PermissionScope {
    pub business_account_id: Uuid,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
}

/// Placeholder permission check.
///
/// This will later query memberships, roles, and role_permissions to decide if
/// a user can perform an action in the requested account, business, or unit.
pub async fn can(_user_id: Uuid, _permission: &str, _scope: PermissionScope) -> bool {
    false
}
