use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, security::tokens, state::AppState};

use super::{model::CreateTransactionRequest, service};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:transaction_id", get(find))
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateTransactionRequest>,
) -> Result<(StatusCode, Json<super::model::TransactionResponse>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create(&state.db, authenticated_user_id(&headers, &state)?, payload).await?),
    ))
}

async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<super::model::TransactionResponse>>, ApiError> {
    Ok(Json(
        service::list(&state.db, authenticated_user_id(&headers, &state)?).await?,
    ))
}

async fn find(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transaction_id): Path<Uuid>,
) -> Result<Json<super::model::TransactionResponse>, ApiError> {
    Ok(Json(
        service::find(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            transaction_id,
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
