use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: Uuid,
    #[serde(skip_serializing)]
    pub business_account_id: Uuid,
    pub business_id: Uuid,
    pub name: String,
    pub sku: Option<String>,
    pub category: String,
    pub manufacturer: Option<String>,
    pub brand: Option<String>,
    pub variant: Option<String>,
    pub package_size: Option<String>,
    pub unit_of_measure: Option<String>,
    pub barcode: Option<String>,
    pub available_quantity: Option<f64>,
    pub low_stock_threshold: Option<f64>,
    pub expiry_date: Option<NaiveDate>,
    pub cost_price: Option<f64>,
    pub default_price: f64,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductWriteRequest {
    pub id: Option<Uuid>,
    pub business_id: Uuid,
    pub name: String,
    pub sku: Option<String>,
    pub category: Option<String>,
    pub manufacturer: Option<String>,
    pub brand: Option<String>,
    pub variant: Option<String>,
    pub package_size: Option<String>,
    pub unit_of_measure: Option<String>,
    pub barcode: Option<String>,
    pub available_quantity: Option<f64>,
    pub low_stock_threshold: Option<f64>,
    pub expiry_date: Option<NaiveDate>,
    pub cost_price: Option<f64>,
    pub default_price: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkCreateProductsRequest {
    pub products: Vec<ProductWriteRequest>,
}
