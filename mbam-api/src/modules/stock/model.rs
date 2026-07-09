use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// One row in the stock movement ledger. Every change to a product's
/// `available_quantity` is recorded here -- see
/// docs/future-stock-management.md's "important design rule".
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StockMovement {
    pub id: Uuid,
    pub product_id: Uuid,
    pub business_id: Uuid,
    pub business_unit_id: Uuid,
    pub movement_type: String,
    pub quantity_delta: f64,
    pub unit_cost: Option<f64>,
    pub source_transaction_id: Option<Uuid>,
    pub source_receipt_import_id: Option<Uuid>,
    pub note: Option<String>,
    /// Batch/lot expiry for this specific movement -- metadata only, see
    /// 0015_stock_movement_expiry.sql's doc comment. Only ever set on
    /// incoming movements (purchase/opening_balance/transfer_in/returned/
    /// sale_refund); `stock::service::validate` enforces that.
    pub expiry_date: Option<NaiveDate>,
    pub created_by: Uuid,
    pub created_by_name: String,
    pub created_at: DateTime<Utc>,
}

/// Request body for a manually-recorded stock movement (purchase received,
/// adjustment, transfer, damaged/expired/returned stock, opening balance).
///
/// `movement_type: "sale"` is rejected here -- sale movements are only ever
/// created as a side effect of `transactions::service::create`, so the
/// ledger can't be double-counted or drift from what was actually sold.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMovementWriteRequest {
    pub product_id: Uuid,
    pub movement_type: String,
    pub quantity_delta: f64,
    pub unit_cost: Option<f64>,
    pub source_receipt_import_id: Option<Uuid>,
    pub note: Option<String>,
    pub expiry_date: Option<NaiveDate>,
}
