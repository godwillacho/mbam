use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, security::tokens, state::AppState};

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
    Ok(Json(
        service::list(&state.db, authenticated_user_id(&headers, &state)?).await?,
    ))
}

async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ProductWriteRequest>,
) -> Result<(StatusCode, Json<Product>), ApiError> {
    let product =
        service::create(&state.db, authenticated_user_id(&headers, &state)?, payload).await?;
    Ok((StatusCode::CREATED, Json(product)))
}

async fn create_bulk(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BulkCreateProductsRequest>,
) -> Result<(StatusCode, Json<Vec<Product>>), ApiError> {
    let products =
        service::create_bulk(&state.db, authenticated_user_id(&headers, &state)?, payload).await?;
    Ok((StatusCode::CREATED, Json(products)))
}

async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<Uuid>,
    Json(payload): Json<ProductWriteRequest>,
) -> Result<Json<Product>, ApiError> {
    Ok(Json(
        service::update(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            product_id,
            payload,
        )
        .await?,
    ))
}

async fn disable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<Uuid>,
) -> Result<Json<Product>, ApiError> {
    Ok(Json(
        service::disable(
            &state.db,
            authenticated_user_id(&headers, &state)?,
            product_id,
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
