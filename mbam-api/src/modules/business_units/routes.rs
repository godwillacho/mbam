use axum::{
    extract::{Path, State},
    routing::patch,
    Json, Router,
};
use uuid::Uuid;

use crate::{auth::AuthorizationContext, error::ApiError, state::AppState};

use super::{
    model::{BusinessUnit, UpdateBusinessUnitRequest},
    service,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/:business_id/units/:unit_id", patch(update))
}

async fn update(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path((business_id, unit_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateBusinessUnitRequest>,
) -> Result<Json<BusinessUnit>, ApiError> {
    Ok(Json(
        service::update(
            &state.db,
            authorization.user_id,
            business_id,
            unit_id,
            payload,
        )
        .await?,
    ))
}
