use chrono::{DateTime, Utc};
use uuid::Uuid;

/// User database record.
///
/// This model represents the `users` table and should not expose password_hash
/// in API responses.
pub struct User {
    pub id: Uuid,
    pub full_name: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: Option<String>,
    pub email_verified: bool,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
