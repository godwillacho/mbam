use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

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
    headers: HeaderMap,
) -> Result<Json<Vec<Product>>, ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok(Json(service::list(&state.db, user_id).await?))
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ProductWriteRequest>,
) -> Result<(StatusCode, Json<Product>), ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(service::create(&state.db, user_id, payload).await?),
    ))
}

async fn create_bulk(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BulkCreateProductsRequest>,
) -> Result<(StatusCode, Json<Vec<Product>>), ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(service::create_bulk(&state.db, user_id, payload).await?),
    ))
}

async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<Uuid>,
    Json(payload): Json<ProductWriteRequest>,
) -> Result<Json<Product>, ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok(Json(
        service::update(&state.db, user_id, product_id, payload).await?,
    ))
}

async fn disable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<Uuid>,
) -> Result<Json<Product>, ApiError> {
    let user_id = state
        .authentication
        .authenticate_user_id(&headers, &state.db)
        .await?;
    Ok(Json(
        service::disable(&state.db, user_id, product_id).await?,
    ))
}
