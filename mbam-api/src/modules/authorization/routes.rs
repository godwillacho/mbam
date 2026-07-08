use axum::{
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};

use crate::{auth::AuthorizationContext, error::ApiError, state::AppState};

use super::{model::AuthorizationBootstrapResponse, service};

/// Builds the authenticated authorization-bootstrap router.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/authorization", get(authorization))
        .route("/login-event", post(login_event))
        .route("/offline-grant", get(offline_grant))
        .route("/logout-event", post(logout_event))
}

async fn login_event(
    authorization: AuthorizationContext,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    crate::modules::audit::record_user_session_event(
        &state.db,
        authorization.user_id,
        "authentication.login",
    )
    .await?;
    Ok(Json(serde_json::json!({ "recorded": true })))
}

async fn logout_event(
    authorization: AuthorizationContext,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    crate::modules::audit::record_user_session_event(
        &state.db,
        authorization.user_id,
        "authentication.logout",
    )
    .await?;
    Ok(Json(serde_json::json!({ "recorded": true })))
}

async fn offline_grant(
    authorization: AuthorizationContext,
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let device_id = headers
        .get("x-mbam-device-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| uuid::Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)?;
    let private_key = state
        .config
        .offline_grant_private_key_pem
        .as_deref()
        .ok_or(ApiError::NotFound)?;
    let token = crate::auth::tokens::create_offline_grant(
        crate::auth::tokens::OfflineGrantSubject {
            user_id: authorization.user_id,
            display_name: authorization.full_name.clone(),
            email: authorization.email.clone(),
            device_id,
            baseline_role: authorization.baseline_role.code().to_string(),
            business_ids: authorization
                .authorized_business_ids
                .iter()
                .copied()
                .collect(),
            business_unit_ids: authorization
                .authorized_business_unit_ids
                .iter()
                .copied()
                .collect(),
            permissions: authorization.permissions.iter().cloned().collect(),
            authorization_version: authorization.authorization_version,
        },
        private_key,
        state.config.offline_grant_days,
    )
    .map_err(|_| ApiError::Internal)?;
    Ok(Json(serde_json::json!({ "token": token })))
}

async fn authorization(
    authorization: AuthorizationContext,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<AuthorizationBootstrapResponse>, ApiError> {
    Ok(Json(service::bootstrap(&state.db, authorization).await?))
}
