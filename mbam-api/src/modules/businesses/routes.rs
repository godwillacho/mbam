use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{
    auth::AuthorizationContext,
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
    authorization: AuthorizationContext,
) -> Result<Json<Vec<Business>>, ApiError> {
    Ok(Json(service::list(&state.db, authorization.user_id).await?))
}

async fn create(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<CreateBusinessRequest>,
) -> Result<(StatusCode, Json<Business>), ApiError> {
    let business = service::create(&state.db, authorization.user_id, payload).await?;
    Ok((StatusCode::CREATED, Json(business)))
}

async fn list_units(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(business_id): Path<Uuid>,
) -> Result<Json<Vec<BusinessUnit>>, ApiError> {
    Ok(Json(
        business_unit_service::list(&state.db, authorization.user_id, business_id).await?,
    ))
}

async fn create_unit(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(business_id): Path<Uuid>,
    Json(payload): Json<CreateBusinessUnitRequest>,
) -> Result<(StatusCode, Json<BusinessUnit>), ApiError> {
    let unit =
        business_unit_service::create(&state.db, authorization.user_id, business_id, payload)
            .await?;
    Ok((StatusCode::CREATED, Json(unit)))
}
