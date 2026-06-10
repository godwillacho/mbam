use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Business record owned by a master business account.
pub struct Business {
    pub id: Uuid,
    pub business_account_id: Uuid,
    pub name: String,
    pub business_type: Option<String>,
    pub country: Option<String>,
    pub currency: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
