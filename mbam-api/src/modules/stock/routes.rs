use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{auth::AuthorizationContext, error::ApiError, state::AppState};

use super::{
    model::{StockMovement, StockMovementWriteRequest},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/movements", get(list).post(create))
        .route("/movements/expiring", get(list_expiring))
}

// Query strings in this API stay snake_case (matching
// reports::model::ReportQuery/ReportDetailQuery), unlike JSON bodies which
// are camelCase -- no rename_all here is deliberate.
#[derive(Debug, Deserialize)]
struct ListStockMovementsQuery {
    product_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
}

async fn list(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ListStockMovementsQuery>,
) -> Result<Json<Vec<StockMovement>>, ApiError> {
    Ok(Json(
        service::list(
            &state.db,
            authorization.user_id,
            query.product_id,
            query.business_unit_id,
        )
        .await?,
    ))
}

/// Batches that recorded an expiry date, soonest-expiring first -- see
/// service::list_expiring. Same `stock.movement.view` gate as `list` above
/// (enforced inside repository::list_expiring_for_user's join, not here).
async fn list_expiring(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Query(query): Query<ListStockMovementsQuery>,
) -> Result<Json<Vec<StockMovement>>, ApiError> {
    Ok(Json(
        service::list_expiring(
            &state.db,
            authorization.user_id,
            query.product_id,
            query.business_unit_id,
        )
        .await?,
    ))
}

async fn create(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<StockMovementWriteRequest>,
) -> Result<(StatusCode, Json<StockMovement>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create_movement(&state.db, authorization.user_id, payload).await?),
    ))
}
