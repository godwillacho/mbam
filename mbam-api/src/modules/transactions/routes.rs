use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, security::tokens, state::AppState};

use super::{
    model::{CreateTransactionRequest, TransactionDraftPayload},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/drafts", get(list_drafts).post(create_draft))
        .route(
            "/drafts/:draft_id",
            get(find_draft).patch(update_draft).delete(delete_draft),
        )
        .route("/:transaction_id", get(find))
}

async fn create_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TransactionDraftPayload>,
) -> Result<(StatusCode, Json<super::model::TransactionDraftResponse>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(
            service::create_draft(&state.db, authenticated_user_id(&headers, &state)?, payload)
                .await?,
        ),
    ))
}

async fn list_drafts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<super::model::TransactionDraftResponse>>, ApiError> {
    Ok(Json(
        service::list_drafts(&state.db, authenticated_user_id(&headers, &state)?).await?,
    ))
}

async fn find_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(draft_id): Path<Uuid>,
) -> Result<Json<super::model::TransactionDraftResponse>, ApiError> {
    Ok(Json(
        service::find_draft(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            draft_id,
        )
        .await?,
    ))
}

async fn update_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(draft_id): Path<Uuid>,
    Json(payload): Json<TransactionDraftPayload>,
) -> Result<Json<super::model::TransactionDraftResponse>, ApiError> {
    Ok(Json(
        service::update_draft(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            draft_id,
            payload,
        )
        .await?,
    ))
}

async fn delete_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(draft_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    service::delete_draft(
        &state.db,
        authenticated_user_id(&headers, &state)?,
        draft_id,
    )
    .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
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
