use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, modules::auth::mailer, security::password};

use super::{
    model::{
        CreateInvitationRequest, CreateInvitationResponse, InvitationDetailsResponse,
        RegisterInvitationRequest, TeamMemberResponse, TeamWorkspaceResponse,
        UpdateTeamMemberRequest,
    },
    repository,
};

pub async fn workspace(db: &PgPool, user_id: Uuid) -> Result<TeamWorkspaceResponse, ApiError> {
    repository::ensure_standard_roles(db, user_id).await?;
    Ok(TeamWorkspaceResponse {
        members: repository::list_members(db, user_id).await?,
        invitations: repository::list_invitations(db, user_id).await?,
        roles: repository::list_roles(db, user_id).await?,
        businesses: repository::list_businesses(db, user_id).await?,
        business_units: repository::list_units(db, user_id).await?,
        authorization_version: repository::authorization_version(db, user_id).await?,
    })
}

pub async fn create_invitation(
    db: &PgPool,
    config: &Config,
    actor_id: Uuid,
    payload: CreateInvitationRequest,
) -> Result<CreateInvitationResponse, ApiError> {
    repository::ensure_standard_roles(db, actor_id).await?;
    let email = payload.email.trim().to_lowercase();
    if email.len() < 5 || !email.contains('@') {
        return Err(ApiError::BadRequest("email must be valid".to_string()));
    }
    if payload.business_unit_id.is_some() && payload.business_id.is_none() {
        return Err(ApiError::BadRequest(
            "a business unit invitation must include its business".to_string(),
        ));
    }

    let account_id = repository::permitted_scope(
        db,
        actor_id,
        "worker.invite",
        payload.business_id,
        payload.business_unit_id,
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    if !repository::validate_role_scope(
        db,
        account_id,
        payload.role_id,
        payload.business_id,
        payload.business_unit_id,
    )
    .await?
    {
        return Err(ApiError::BadRequest(
            "role and business scope do not belong to the same account".to_string(),
        ));
    }

    let roles = repository::list_roles(db, actor_id).await?;
    let role = roles
        .iter()
        .find(|role| role.id == payload.role_id)
        .ok_or(ApiError::Forbidden)?;
    match role.code.as_str() {
        "business_admin" if payload.business_id.is_none() || payload.business_unit_id.is_some() => {
            return Err(ApiError::BadRequest(
                "business administrators must be assigned to one business".to_string(),
            ));
        }
        "shop_manager" | "cashier" if payload.business_unit_id.is_none() => {
            return Err(ApiError::BadRequest(
                "this role must be assigned to one business unit".to_string(),
            ));
        }
        _ => {}
    }

    let raw_token = Uuid::new_v4().to_string();
    let token_hash = hash_token(&raw_token);
    let invitation = repository::create_invitation(
        db,
        repository::CreateInvitationParams {
            actor_id,
            account_id,
            email: &email,
            role_id: payload.role_id,
            business_id: payload.business_id,
            unit_id: payload.business_unit_id,
            token_hash: &token_hash,
            expires_at: Utc::now() + Duration::days(7),
        },
    )
    .await?;
    let invite_url = format!("{}/invite?token={raw_token}", config.web_origin);
    if let Err(error) = mailer::send_invitation(config, &email, &invite_url).await {
        tracing::warn!(?error, %email, "invitation created but email delivery failed");
    }
    Ok(CreateInvitationResponse {
        invitation,
        invite_url,
    })
}

pub async fn invitation_details(
    db: &PgPool,
    raw_token: &str,
) -> Result<InvitationDetailsResponse, ApiError> {
    let invitation = repository::invitation_details(db, &hash_token(raw_token.trim()))
        .await?
        .ok_or(ApiError::NotFound)?;
    if invitation.status != "pending" || invitation.expires_at <= Utc::now() {
        return Err(ApiError::BadRequest(
            "invitation is no longer available".to_string(),
        ));
    }
    Ok(invitation)
}

pub async fn accept_invitation(
    db: &PgPool,
    user_id: Uuid,
    raw_token: &str,
) -> Result<TeamMemberResponse, ApiError> {
    let user_email = repository::user_email(db, user_id)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    repository::accept_invitation(db, user_id, &user_email, &hash_token(raw_token.trim()))
        .await?
        .ok_or_else(|| {
            ApiError::BadRequest(
                "invitation is invalid, expired, or belongs to another email".to_string(),
            )
        })
}

pub async fn register_invitation(
    db: &PgPool,
    payload: RegisterInvitationRequest,
) -> Result<(), ApiError> {
    let full_name = payload.full_name.trim();
    if full_name.len() < 2 {
        return Err(ApiError::BadRequest(
            "full name must be at least 2 characters".to_string(),
        ));
    }
    if payload.password.len() < 8
        || !payload.password.chars().any(char::is_uppercase)
        || !payload.password.chars().any(|value| value.is_ascii_digit())
    {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters with an uppercase letter and number"
                .to_string(),
        ));
    }
    let password_hash =
        password::hash_password(&payload.password).map_err(|_| ApiError::Internal)?;
    repository::register_invited_user(
        db,
        full_name,
        &password_hash,
        &hash_token(payload.token.trim()),
    )
    .await?
    .ok_or_else(|| {
        ApiError::BadRequest(
            "invitation is invalid, expired, or the email already has an account".to_string(),
        )
    })?;
    Ok(())
}

pub async fn update_member(
    db: &PgPool,
    actor_id: Uuid,
    membership_id: Uuid,
    payload: UpdateTeamMemberRequest,
) -> Result<TeamMemberResponse, ApiError> {
    let current = repository::find_member(db, membership_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    if current.user_id == actor_id {
        return Err(ApiError::BadRequest(
            "you cannot change your own role or access".to_string(),
        ));
    }
    let business_id = payload.business_id.unwrap_or(current.business_id);
    let unit_id = payload.business_unit_id.unwrap_or(current.business_unit_id);
    let role_was_selected = payload.role_id.is_some();
    if role_was_selected && payload.custom_permissions.is_some() {
        return Err(ApiError::BadRequest(
            "choose a standard role or custom permissions, not both".to_string(),
        ));
    }
    let mut role_id = payload.role_id.unwrap_or(current.role_id);
    let status = payload.status.as_deref().unwrap_or(&current.status);
    if !matches!(status, "active" | "disabled") {
        return Err(ApiError::BadRequest(
            "employee status must be active or disabled".to_string(),
        ));
    }
    let permission = if status == "disabled" {
        "worker.disable"
    } else {
        "worker.update"
    };
    let account_id = repository::permitted_scope(
        db,
        actor_id,
        permission,
        current.business_id,
        current.business_unit_id,
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    let target_account_id =
        repository::permitted_scope(db, actor_id, permission, business_id, unit_id)
            .await?
            .ok_or(ApiError::Forbidden)?;
    if account_id != current.business_account_id || target_account_id != current.business_account_id
    {
        return Err(ApiError::Forbidden);
    }
    if let Some(custom_permissions) = payload.custom_permissions {
        if custom_permissions.is_empty() {
            return Err(ApiError::BadRequest(
                "select at least one screen for a custom role".to_string(),
            ));
        }
        let mut permissions = custom_permissions;
        permissions.sort();
        permissions.dedup();
        if !repository::can_assign_permissions(db, actor_id, account_id, &permissions).await? {
            return Err(ApiError::Forbidden);
        }
        role_id = repository::upsert_custom_role(
            db,
            account_id,
            membership_id,
            &current.full_name,
            &permissions,
        )
        .await?;
    } else if role_was_selected && !repository::role_is_assignable(db, account_id, role_id).await? {
        return Err(ApiError::Forbidden);
    }
    if !repository::validate_role_scope(db, account_id, role_id, business_id, unit_id).await? {
        return Err(ApiError::Forbidden);
    }
    repository::update_member(
        db,
        actor_id,
        membership_id,
        role_id,
        business_id,
        unit_id,
        status,
    )
    .await?
    .ok_or(ApiError::NotFound)
}

pub async fn delete_member(
    db: &PgPool,
    actor_id: Uuid,
    membership_id: Uuid,
) -> Result<TeamMemberResponse, ApiError> {
    update_member(
        db,
        actor_id,
        membership_id,
        UpdateTeamMemberRequest {
            role_id: None,
            custom_permissions: None,
            business_id: None,
            business_unit_id: None,
            status: Some("disabled".to_string()),
        },
    )
    .await
}

pub async fn cancel_invitation(
    db: &PgPool,
    actor_id: Uuid,
    invitation_id: Uuid,
) -> Result<(), ApiError> {
    let invite = repository::find_invitation(db, invitation_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    repository::permitted_scope(
        db,
        actor_id,
        "worker.invite",
        invite.business_id,
        invite.business_unit_id,
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    if !repository::cancel_invitation(db, actor_id, invitation_id).await? {
        return Err(ApiError::NotFound);
    }
    Ok(())
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}
