use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Role record used by memberships.
pub struct Role {
    pub id: Uuid,
    pub business_account_id: Option<Uuid>,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system_role: bool,
    pub created_at: DateTime<Utc>,
}
