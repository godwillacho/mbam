use chrono::{DateTime, Utc};
use uuid::Uuid;

/// User membership in an account, business, or business unit.
pub struct Membership {
    pub id: Uuid,
    pub user_id: Uuid,
    pub business_account_id: Uuid,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
    pub role_id: Uuid,
    pub status: String,
    pub invited_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
