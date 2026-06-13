use axum::{
    extract::{Query, State},
    http::{header, HeaderMap},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{error::ApiError, security::tokens, state::AppState};

use super::{model::SyncPushRequest, service};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullQuery {
    cursor: Option<String>,
    device_id: Option<Uuid>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pull", get(pull))
        .route("/push", post(push))
}

async fn pull(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PullQuery>,
) -> Result<Json<super::model::SyncPullResult>, ApiError> {
    let user_id = authenticated_user_id(&headers, &state)?;
    Ok(Json(
        service::pull(&state.db, user_id, query.cursor.as_deref(), query.device_id).await?,
    ))
}

async fn push(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SyncPushRequest>,
) -> Result<Json<Vec<super::model::SyncPushResult>>, ApiError> {
    let user_id = authenticated_user_id(&headers, &state)?;
    Ok(Json(service::push(&state.db, user_id, payload).await?))
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
