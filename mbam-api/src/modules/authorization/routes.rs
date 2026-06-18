use axum::{routing::get, Json, Router};

use crate::{authentication::AuthorizationContext, error::ApiError, state::AppState};

use super::{model::AuthorizationBootstrapResponse, service};

/// Builds the authenticated authorization-bootstrap router.
pub fn router() -> Router<AppState> {
    Router::new().route("/authorization", get(authorization))
}

async fn authorization(
    authorization: AuthorizationContext,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<AuthorizationBootstrapResponse>, ApiError> {
    Ok(Json(service::bootstrap(&state.db, authorization).await?))
}
