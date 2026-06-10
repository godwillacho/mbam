use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Master business account record.
pub struct BusinessAccount {
    pub id: Uuid,
    pub name: String,
    pub owner_user_id: Uuid,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
