use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushRequest {
    pub operations: Vec<Value>,
    pub device_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPushResult {
    pub operation_id: String,
    pub outcome: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_version: Option<i64>,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_value: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudChange {
    pub change_id: String,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub version: i64,
    pub deleted: bool,
    pub payload: Value,
    pub changed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPullResult {
    pub cursor: String,
    pub user_id: Uuid,
    pub authorization_version: i64,
    pub allowed_business_ids: Vec<Uuid>,
    pub allowed_business_unit_ids: Vec<Uuid>,
    pub permissions: Vec<String>,
    pub restrict_to_own_records: bool,
    pub authorization_scopes: Vec<SyncAuthorizationScope>,
    pub allowed_entity_keys: Vec<String>,
    pub changes: Vec<CloudChange>,
    pub sync_run_id: Uuid,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAuthorizationScope {
    pub business_ids: Vec<Uuid>,
    pub business_unit_ids: Vec<Uuid>,
    pub permissions: Vec<String>,
    pub restrict_to_own_records: bool,
}
