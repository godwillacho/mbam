use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransactionLineRequest {
    pub product_id: Option<Uuid>,
    pub product_name: String,
    pub sku: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransactionRequest {
    pub id: Option<Uuid>,
    pub business_id: Uuid,
    pub business_unit_id: Option<Uuid>,
    pub customer_name: String,
    pub customer_contact: Option<String>,
    pub payment_method: String,
    pub payment_status: Option<String>,
    pub outstanding_amount: Option<f64>,
    pub idempotency_key: String,
    pub created_at: Option<DateTime<Utc>>,
    pub lines: Vec<CreateTransactionLineRequest>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRecord {
    pub id: Uuid,
    pub business_id: Uuid,
    pub business_unit_id: Option<Uuid>,
    pub customer_name: String,
    pub customer_contact: Option<String>,
    pub payment_method: String,
    pub payment_status: String,
    pub status: String,
    pub outstanding_amount: f64,
    pub total_amount: f64,
    pub recorded_by_user_id: Uuid,
    pub recorded_by: String,
    pub idempotency_key: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TransactionLine {
    pub id: Uuid,
    pub transaction_id: Uuid,
    pub product_id: Option<Uuid>,
    pub product_name_snapshot: String,
    pub sku_snapshot: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub line_total: f64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionResponse {
    #[serde(flatten)]
    pub transaction: TransactionRecord,
    pub lines: Vec<TransactionLine>,
}
