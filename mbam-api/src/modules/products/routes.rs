use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{authentication::AuthorizationContext, error::ApiError, state::AppState};

use super::{
    model::{BulkCreateProductsRequest, Product, ProductWriteRequest},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/bulk", post(create_bulk))
        .route("/:product_id", patch(update).delete(disable))
}

async fn list(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
) -> Result<Json<Vec<Product>>, ApiError> {
    Ok(Json(service::list(&state.db, authorization.user_id).await?))
}

async fn create(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<ProductWriteRequest>,
) -> Result<(StatusCode, Json<Product>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create(&state.db, authorization.user_id, payload).await?),
    ))
}

async fn create_bulk(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<BulkCreateProductsRequest>,
) -> Result<(StatusCode, Json<Vec<Product>>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create_bulk(&state.db, authorization.user_id, payload).await?),
    ))
}

async fn update(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(product_id): Path<Uuid>,
    Json(payload): Json<ProductWriteRequest>,
) -> Result<Json<Product>, ApiError> {
    Ok(Json(
        service::update(&state.db, authorization.user_id, product_id, payload).await?,
    ))
}

async fn disable(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(product_id): Path<Uuid>,
) -> Result<Json<Product>, ApiError> {
    Ok(Json(
        service::disable(&state.db, authorization.user_id, product_id).await?,
    ))
}
