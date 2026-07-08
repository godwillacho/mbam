use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{auth::AuthorizationContext, error::ApiError, state::AppState};

use super::{
    model::{CreateTransactionRequest, TransactionDraftPayload},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/recent", get(recent))
        .route("/drafts", get(list_drafts).post(create_draft))
        .route(
            "/drafts/:draft_id",
            get(find_draft).patch(update_draft).delete(delete_draft),
        )
        .route("/:transaction_id", get(find))
}

async fn create_draft(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<TransactionDraftPayload>,
) -> Result<(StatusCode, Json<super::model::TransactionDraftResponse>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create_draft(&state.db, authorization.user_id, payload).await?),
    ))
}

async fn list_drafts(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
) -> Result<Json<Vec<super::model::TransactionDraftResponse>>, ApiError> {
    Ok(Json(
        service::list_drafts(&state.db, authorization.user_id).await?,
    ))
}

async fn find_draft(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(draft_id): Path<Uuid>,
) -> Result<Json<super::model::TransactionDraftResponse>, ApiError> {
    Ok(Json(
        service::find_draft(&state.db, authorization.user_id, draft_id).await?,
    ))
}

async fn update_draft(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(draft_id): Path<Uuid>,
    Json(payload): Json<TransactionDraftPayload>,
) -> Result<Json<super::model::TransactionDraftResponse>, ApiError> {
    Ok(Json(
        service::update_draft(&state.db, authorization.user_id, draft_id, payload).await?,
    ))
}

async fn delete_draft(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(draft_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    service::delete_draft(&state.db, authorization.user_id, draft_id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn create(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<CreateTransactionRequest>,
) -> Result<(StatusCode, Json<super::model::TransactionResponse>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create(&state.db, authorization.user_id, payload).await?),
    ))
}

async fn list(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
) -> Result<Json<Vec<super::model::TransactionResponse>>, ApiError> {
    Ok(Json(service::list(&state.db, authorization.user_id).await?))
}

async fn recent(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
) -> Result<Json<Vec<super::model::TransactionResponse>>, ApiError> {
    Ok(Json(service::recent(&state.db, &authorization).await?))
}

async fn find(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(transaction_id): Path<Uuid>,
) -> Result<Json<super::model::TransactionResponse>, ApiError> {
    let transaction = service::find(&state.db, authorization.user_id, transaction_id).await?;
    authorization.require_transaction(
        transaction.transaction.recorded_by_user_id,
        transaction.transaction.business_id,
        transaction.transaction.business_unit_id,
    )?;
    Ok(Json(transaction))
}
