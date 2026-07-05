use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::{authentication::AuthorizationContext, error::ApiError, state::AppState};

use super::{
    model::{DashboardSummaryResponse, ReportDetailResponse, ReportQuery, ReportResponse},
    service,
};

#[derive(Debug, Deserialize)]
struct DashboardSummaryQuery {
    timezone: Option<String>,
}

/// Builds scoped reporting and dashboard aggregation routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/businesses", get(business_revenue))
        .route("/shops", get(shop_revenue))
        .route("/employees", get(employee_sales))
        .route("/products", get(product_sales))
        .route("/transactions", get(transaction_detail))
        .route("/dashboard-summary", get(dashboard_summary))
}

async fn business_revenue(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ReportQuery>,
) -> Result<Json<ReportResponse>, ApiError> {
    Ok(Json(
        service::business_revenue(&state.db, &authorization, query).await?,
    ))
}

async fn shop_revenue(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ReportQuery>,
) -> Result<Json<ReportResponse>, ApiError> {
    Ok(Json(
        service::shop_revenue(&state.db, &authorization, query).await?,
    ))
}

async fn employee_sales(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ReportQuery>,
) -> Result<Json<ReportResponse>, ApiError> {
    Ok(Json(
        service::employee_sales(&state.db, &authorization, query).await?,
    ))
}

async fn product_sales(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ReportQuery>,
) -> Result<Json<ReportResponse>, ApiError> {
    Ok(Json(
        service::product_sales(&state.db, &authorization, query).await?,
    ))
}

async fn transaction_detail(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ReportQuery>,
) -> Result<Json<ReportDetailResponse>, ApiError> {
    Ok(Json(
        service::transaction_detail(&state.db, &authorization, query).await?,
    ))
}

async fn dashboard_summary(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<DashboardSummaryQuery>,
) -> Result<Json<DashboardSummaryResponse>, ApiError> {
    Ok(Json(
        service::dashboard_summary(&state.db, &authorization, query.timezone).await?,
    ))
}
