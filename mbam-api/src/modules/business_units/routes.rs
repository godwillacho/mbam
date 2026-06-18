use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::patch,
    Json, Router,
};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

use super::{model::{BusinessUnit, UpdateBusinessUnitRequest}, service};

pub fn router() -> Router<AppState> {
    Router::new().route("/:business_id/units/:unit_id", patch(update))
}

async fn update(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((business_id, unit_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateBusinessUnitRequest>,
) -> Result<Json<BusinessUnit>, ApiError> {
    let user_id = state.authentication.authenticate_user_id(&headers, &state.db).await?;
    Ok(Json(service::update(&state.db, user_id, business_id, unit_id, payload).await?))
}
