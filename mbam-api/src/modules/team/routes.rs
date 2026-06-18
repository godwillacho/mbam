use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    authentication::{AuthenticatedPrincipal, AuthorizationContext},
    error::ApiError,
    state::AppState,
};

use super::{
    model::{CreateInvitationRequest, RegisterInvitationRequest, UpdateTeamMemberRequest},
    service,
};

#[derive(Debug, Deserialize)]
struct TokenPayload {
    token: String,
}

pub fn team_router() -> Router<AppState> {
    Router::new().route("/", get(workspace)).route(
        "/:membership_id",
        patch(update_member).delete(delete_member),
    )
}

pub fn invitation_router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_invitation))
        .route("/:invitation_id", delete(cancel_invitation))
        .route("/details", post(invitation_details))
        .route("/accept", post(accept_invitation))
        .route("/register", post(register_invitation))
}

async fn workspace(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
) -> Result<Json<super::model::TeamWorkspaceResponse>, ApiError> {
    Ok(Json(service::workspace(&state.db, &authorization).await?))
}

async fn create_invitation(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Json(payload): Json<CreateInvitationRequest>,
) -> Result<(StatusCode, Json<super::model::CreateInvitationResponse>), ApiError> {
    Ok((
        StatusCode::CREATED,
        Json(service::create_invitation(&state.db, &state.config, &authorization, payload).await?),
    ))
}

async fn invitation_details(
    State(state): State<AppState>,
    Json(payload): Json<TokenPayload>,
) -> Result<Json<super::model::InvitationDetailsResponse>, ApiError> {
    Ok(Json(
        service::invitation_details(&state.db, &payload.token).await?,
    ))
}

async fn accept_invitation(
    State(state): State<AppState>,
    principal: AuthenticatedPrincipal,
    Json(payload): Json<TokenPayload>,
) -> Result<Json<super::model::TeamMemberResponse>, ApiError> {
    Ok(Json(
        service::accept_invitation(&state.db, principal.user_id, &payload.token).await?,
    ))
}

async fn register_invitation(
    State(state): State<AppState>,
    Json(payload): Json<RegisterInvitationRequest>,
) -> Result<Json<Value>, ApiError> {
    service::register_invitation(&state.db, payload).await?;
    Ok(Json(json!({ "message": "invited account created" })))
}

async fn update_member(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(membership_id): Path<Uuid>,
    Json(payload): Json<UpdateTeamMemberRequest>,
) -> Result<Json<super::model::TeamMemberResponse>, ApiError> {
    Ok(Json(
        service::update_member(&state.db, &authorization, membership_id, payload).await?,
    ))
}

async fn delete_member(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(membership_id): Path<Uuid>,
) -> Result<Json<super::model::TeamMemberResponse>, ApiError> {
    Ok(Json(
        service::delete_member(&state.db, &authorization, membership_id).await?,
    ))
}

async fn cancel_invitation(
    State(state): State<AppState>,
    authorization: AuthorizationContext,
    Path(invitation_id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    service::cancel_invitation(&state.db, &authorization, invitation_id).await?;
    Ok(Json(json!({ "message": "invitation cancelled" })))
}
