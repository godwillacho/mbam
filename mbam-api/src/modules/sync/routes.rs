use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{authentication::AuthorizationContext, error::ApiError, state::AppState};

use super::{model::SyncPushRequest, service};

const DEVICE_ID_HEADER: &str = "x-mbam-device-id";

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
    authorization: AuthorizationContext,
    headers: HeaderMap,
    Query(query): Query<PullQuery>,
) -> Result<Json<super::model::SyncPullResult>, ApiError> {
    let device_id = request_device_id(&headers)?;
    if query.device_id != Some(device_id) {
        return Err(ApiError::Unauthorized);
    }
    Ok(Json(
        service::pull(
            &state.db,
            &authorization,
            query.cursor.as_deref(),
            Some(device_id),
        )
        .await?,
    ))
}

async fn push(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    headers: HeaderMap,
    Json(payload): Json<SyncPushRequest>,
) -> Result<Json<Vec<super::model::SyncPushResult>>, ApiError> {
    let user_id = authorization.user_id;
    let device_id = request_device_id(&headers)?;
    if payload.device_id != Some(device_id)
        || payload
            .operations
            .iter()
            .any(|operation| !operation_bound_to_session(operation, user_id, device_id))
    {
        return Err(ApiError::Unauthorized);
    }
    Ok(Json(
        service::push(&state.db, &authorization, payload).await?,
    ))
}

fn operation_bound_to_session(operation: &Value, user_id: Uuid, device_id: Uuid) -> bool {
    let operation_user_id = operation
        .get("userId")
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok());
    let operation_device_id = operation
        .get("deviceId")
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok());
    operation_user_id == Some(user_id) && operation_device_id == Some(device_id)
}

fn request_device_id(headers: &HeaderMap) -> Result<Uuid, ApiError> {
    headers
        .get(DEVICE_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)
}
