use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Shop, branch, warehouse, or other operational unit.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BusinessUnit {
    pub id: Uuid,
    #[serde(skip_serializing)]
    pub business_account_id: Uuid,
    pub business_id: Uuid,
    pub name: String,
    pub unit_type: String,
    pub location: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBusinessUnitRequest {
    pub name: String,
    pub unit_type: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBusinessUnitRequest {
    pub name: String,
    pub unit_type: Option<String>,
    pub location: Option<String>,
    pub status: Option<String>,
}
