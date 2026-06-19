use axum::{extract::State, routing::get, Json, Router};

use crate::{authentication::AuthorizationContext, error::ApiError, state::AppState};

use super::{model::SyncStatusResponse, repository};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(statuses))
}

async fn statuses(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
) -> Result<Json<Vec<SyncStatusResponse>>, ApiError> {
    authorization.require_permission("worker.update")?;
    let membership_ids = crate::modules::team::service::workspace(&state.db, &authorization)
        .await?
        .members
        .iter()
        .map(|member| member.id)
        .collect::<Vec<_>>();
    Ok(Json(
        repository::statuses(&state.db, &membership_ids).await?,
    ))
}
