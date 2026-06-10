use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Shop, branch, warehouse, or other operational unit.
pub struct BusinessUnit {
    pub id: Uuid,
    pub business_account_id: Uuid,
    pub business_id: Uuid,
    pub name: String,
    pub unit_type: String,
    pub location: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
