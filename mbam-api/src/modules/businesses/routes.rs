use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
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
    security::tokens,
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
    let user_id = authenticated_user_id(&headers, &state)?;
    Ok(Json(service::list(&state.db, user_id).await?))
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateBusinessRequest>,
) -> Result<(StatusCode, Json<Business>), ApiError> {
    let user_id = authenticated_user_id(&headers, &state)?;
    let business = service::create(&state.db, user_id, payload).await?;
    Ok((StatusCode::CREATED, Json(business)))
}

async fn list_units(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(business_id): Path<Uuid>,
) -> Result<Json<Vec<BusinessUnit>>, ApiError> {
    let user_id = authenticated_user_id(&headers, &state)?;
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
    let user_id = authenticated_user_id(&headers, &state)?;
    let unit = business_unit_service::create(&state.db, user_id, business_id, payload).await?;
    Ok((StatusCode::CREATED, Json(unit)))
}

fn authenticated_user_id(headers: &HeaderMap, state: &AppState) -> Result<Uuid, ApiError> {
    let authorization = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    let token = authorization
        .strip_prefix("Bearer ")
        .ok_or(ApiError::Unauthorized)?;

    tokens::verify_access_token(token, &state.config.jwt_access_secret)
        .map(|claims| claims.sub)
        .map_err(|_| ApiError::Unauthorized)
}
