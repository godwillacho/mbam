use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, security::tokens, state::AppState};

use super::{
    model::{Business, CreateBusinessRequest},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list).post(create))
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
