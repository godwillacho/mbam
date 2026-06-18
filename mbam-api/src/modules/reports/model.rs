use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Query parameters shared by reporting aggregation endpoints.
#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    pub timeframe: Option<String>,
    pub timezone: Option<String>,
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
