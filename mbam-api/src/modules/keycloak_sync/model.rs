use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct OutboxJob {
    pub id: Uuid,
    pub membership_id: Uuid,
    pub user_id: Uuid,
    pub business_account_id: Uuid,
    pub desired_baseline_role: Option<String>,
    pub attempts: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SyncStatusResponse {
    pub membership_id: Uuid,
    pub status: String,
    pub attempts: i32,
    pub last_error: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct KeycloakRoleRepresentation {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct KeycloakTokenResponse {
    pub access_token: String,
}
