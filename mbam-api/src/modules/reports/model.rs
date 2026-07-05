use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Query parameters shared by reporting aggregation endpoints.
#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    pub timeframe: Option<String>,
    pub timezone: Option<String>,
    /// Inclusive `YYYY-MM-DD` range start, required only when `timeframe` is
    /// `"custom"`. Ignored for the fixed daily/weekly/monthly/yearly presets,
    /// which stay anchored to the current moment.
    pub start_date: Option<String>,
    /// Inclusive `YYYY-MM-DD` range end, required only when `timeframe` is
    /// `"custom"`.
    pub end_date: Option<String>,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
    pub employee_id: Option<Uuid>,
    pub product_id: Option<Uuid>,
}

/// One chart point returned by an authoritative aggregation.
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct ReportPoint {
    pub bucket_start: DateTime<Utc>,
    pub revenue: f64,
    pub quantity: f64,
    pub transaction_count: i64,
}

/// One authorized entity and its aggregate chart series.
#[derive(Clone, Debug, Serialize)]
pub struct ReportSeries {
    pub entity_id: Uuid,
    pub entity_name: String,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
    pub total_revenue: f64,
    pub total_quantity: f64,
    pub transaction_count: i64,
    pub points: Vec<ReportPoint>,
}

/// Complete response for one reporting dimension and timeframe.
#[derive(Debug, Serialize)]
pub struct ReportResponse {
    pub dimension: String,
    pub timeframe: String,
    pub timezone: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub series: Vec<ReportSeries>,
}

/// One dashboard leader cell backed by the reporting API.
#[derive(Debug, Serialize)]
pub struct DashboardLeader {
    pub entity_id: Uuid,
    pub entity_name: String,
    pub primary_value: f64,
    pub secondary_value: f64,
    pub detail_path: String,
    pub points: Vec<ReportPoint>,
}

/// Role-scoped daily dashboard metrics.
#[derive(Debug, Serialize)]
pub struct DashboardSummaryResponse {
    pub business: Option<DashboardLeader>,
    pub shop: Option<DashboardLeader>,
    pub employee: Option<DashboardLeader>,
    pub product: Option<DashboardLeader>,
}

/// One printable transaction-line row for the raw/audit-grade detail report.
///
/// Deliberately flat (one row per transaction line, transaction-level fields
/// repeated) so it maps directly onto a single exportable/printable table
/// instead of a nested transaction/line structure.
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
pub struct ReportDetailRow {
    pub transaction_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub business_id: Uuid,
    pub business_name: String,
    pub business_unit_id: Option<Uuid>,
    pub business_unit_name: Option<String>,
    pub customer_name: String,
    pub payment_method: String,
    pub status: String,
    pub recorded_by_user_id: Uuid,
    pub recorded_by: String,
    pub transaction_total: f64,
    pub line_id: Uuid,
    pub product_name: String,
    pub sku: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub line_total: f64,
}

/// Complete response for the raw transaction/line-item detail report.
#[derive(Debug, Serialize)]
pub struct ReportDetailResponse {
    pub timeframe: String,
    pub timezone: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub rows: Vec<ReportDetailRow>,
    pub row_count: i64,
    /// True when more rows matched the filters than the endpoint's row cap
    /// returned. The caller should narrow the timeframe or scope to see the
    /// remaining rows rather than assume the table is complete.
    pub truncated: bool,
}
