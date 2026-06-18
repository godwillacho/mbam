use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

use super::{model::{CreateTransactionRequest, TransactionDraftPayload}, service};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/drafts", get(list_drafts).post(create_draft))
        .route("/drafts/:draft_id", get(find_draft).patch(update_draft).delete(delete_draft))
        .route("/:transaction_id", get(find))
}

async fn create_draft(
    State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<TransactionDraftPayload>,
) -> Result<(StatusCode, Json<super::model::TransactionDraftResponse>), ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok((StatusCode::CREATED, Json(service::create_draft(&state.db, user_id, payload).await?)))
}

async fn list_drafts(
    State(state): State<AppState>, headers: HeaderMap,
) -> Result<Json<Vec<super::model::TransactionDraftResponse>>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok(Json(service::list_drafts(&state.db, user_id).await?))
}

async fn find_draft(
    State(state): State<AppState>, headers: HeaderMap, Path(draft_id): Path<Uuid>,
) -> Result<Json<super::model::TransactionDraftResponse>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok(Json(service::find_draft(&state.db, user_id, draft_id).await?))
}

async fn update_draft(
    State(state): State<AppState>, headers: HeaderMap, Path(draft_id): Path<Uuid>,
    Json(payload): Json<TransactionDraftPayload>,
) -> Result<Json<super::model::TransactionDraftResponse>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok(Json(service::update_draft(&state.db, user_id, draft_id, payload).await?))
}

async fn delete_draft(
    State(state): State<AppState>, headers: HeaderMap, Path(draft_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    service::delete_draft(&state.db, user_id, draft_id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn create(
    State(state): State<AppState>, headers: HeaderMap, Json(payload): Json<CreateTransactionRequest>,
) -> Result<(StatusCode, Json<super::model::TransactionResponse>), ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok((StatusCode::CREATED, Json(service::create(&state.db, user_id, payload).await?)))
}

async fn list(
    State(state): State<AppState>, headers: HeaderMap,
) -> Result<Json<Vec<super::model::TransactionResponse>>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok(Json(service::list(&state.db, user_id).await?))
}

async fn find(
    State(state): State<AppState>, headers: HeaderMap, Path(transaction_id): Path<Uuid>,
) -> Result<Json<super::model::TransactionResponse>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok(Json(service::find(&state.db, user_id, transaction_id).await?))
}
