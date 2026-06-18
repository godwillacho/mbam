use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{
    error::ApiError,
    modules::business_units::{
        model::{BusinessUnit, CreateBusinessUnitRequest},
        service as business_unit_service,
    },
    state::AppState,
};

use super::{
    model::{Business, CreateBusinessRequest},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:business_id/units", get(list_units).post(create_unit))
}

async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<Business>>, ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok(Json(service::list(&state.db, user_id).await?))
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateBusinessRequest>,
) -> Result<(StatusCode, Json<Business>), ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    let business = service::create(&state.db, user_id, payload).await?;
    Ok((StatusCode::CREATED, Json(business)))
}

async fn list_units(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(business_id): Path<Uuid>,
) -> Result<Json<Vec<BusinessUnit>>, ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok(Json(
        business_unit_service::list(&state.db, user_id, business_id).await?,
    ))
}

async fn create_unit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(business_id): Path<Uuid>,
    Json(payload): Json<CreateBusinessUnitRequest>,
) -> Result<(StatusCode, Json<BusinessUnit>), ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    let unit = business_unit_service::create(&state.db, user_id, business_id, payload).await?;
    Ok((StatusCode::CREATED, Json(unit)))
}
