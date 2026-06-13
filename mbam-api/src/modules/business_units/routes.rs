use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    routing::{get, patch},
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, security::tokens, state::AppState};

use super::{
    model::{BusinessUnit, CreateBusinessUnitRequest, UpdateBusinessUnitRequest},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/:business_id/units", get(list).post(create))
        .route("/:business_id/units/:unit_id", patch(update))
}

async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(business_id): Path<Uuid>,
) -> Result<Json<Vec<BusinessUnit>>, ApiError> {
    Ok(Json(
        service::list(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            business_id,
        )
        .await?,
    ))
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(business_id): Path<Uuid>,
    Json(payload): Json<CreateBusinessUnitRequest>,
) -> Result<(StatusCode, Json<BusinessUnit>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(
            service::create(
                &state.db,
                authenticated_user_id(&headers, &state)?,
                business_id,
                payload,
            )
            .await?,
        ),
    ))
}

async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((business_id, unit_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateBusinessUnitRequest>,
) -> Result<Json<BusinessUnit>, ApiError> {
    Ok(Json(
        service::update(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            business_id,
            unit_id,
            payload,
        )
        .await?,
    ))
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
