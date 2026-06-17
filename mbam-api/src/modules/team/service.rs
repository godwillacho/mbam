use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::{config::Config, error::ApiError, modules::auth::mailer, security::password};

use super::{
    model::{
        BusinessScopeResponse, CreateInvitationRequest, CreateInvitationResponse,
        DashboardOptionResponse, DashboardProfileResponse, InvitationDetailsResponse,
        RegisterInvitationRequest, RoleResponse, TeamMemberResponse, TeamWorkspaceResponse,
        UnitScopeResponse, UpdateTeamMemberRequest,
    },
    repository,
};

const CUSTOM_ROLE_PREFIX: &str = "custom_member_";

pub async fn workspace(db: &PgPool, user_id: Uuid) -> Result<TeamWorkspaceResponse, ApiError> {
    repository::ensure_standard_roles(db, user_id).await?;
    let members = repository::list_members(db, user_id).await?;
    let invitations = repository::list_invitations(db, user_id).await?;
    let roles = repository::list_roles(db, user_id).await?;
    let businesses = repository::list_businesses(db, user_id).await?;
    let business_units = repository::list_units(db, user_id).await?;
    let dashboard_profiles = build_dashboard_profiles(
        user_id,
        &members,
        &roles,
        &businesses,
        &business_units,
    );
    let authorization_version = repository::authorization_version(db, user_id).await?;

    Ok(TeamWorkspaceResponse {
        members,
        invitations,
        roles,
        businesses,
        business_units,
        dashboard_profiles,
        authorization_version,
    })
}

fn build_dashboard_profiles(
    user_id: Uuid,
    members: &[TeamMemberResponse],
    roles: &[RoleResponse],
    businesses: &[BusinessScopeResponse],
    business_units: &[UnitScopeResponse],
) -> Vec<DashboardProfileResponse> {
    let permissions_by_role = roles
        .iter()
        .map(|role| (role.id, role.permissions.clone()))
        .collect::<HashMap<_, _>>();

    members
        .iter()
        .filter(|member| member.user_id == user_id && member.status == "active")
        .map(|member| {
            let permissions = permissions_by_role
                .get(&member.role_id)
                .cloned()
                .unwrap_or_default();
            let scope_level = scope_level(member);
            let scope_label = scope_label(member, businesses, business_units);
            let dashboards = dashboards_for_member(member, &permissions);
            let base_dashboard_id = dashboards
                .iter()
                .find(|dashboard| dashboard.is_baseline)
                .map(|dashboard| dashboard.id.clone())
                .unwrap_or_else(|| "personal_dashboard".to_string());

            DashboardProfileResponse {
                membership_id: member.id,
                user_id: member.user_id,
                role_code: member.role_code.clone(),
                role_name: member.role_name.clone(),
                scope_level,
                scope_label,
                base_dashboard_id,
                permissions,
                dashboards,
            }
        })
        .collect()
}

fn scope_level(member: &TeamMemberResponse) -> String {
    if member.business_unit_id.is_some() {
        "unit".to_string()
    } else if member.business_id.is_some() {
        "business".to_string()
    } else {
        "master".to_string()
    }
}

fn scope_label(
    member: &TeamMemberResponse,
    businesses: &[BusinessScopeResponse],
    business_units: &[UnitScopeResponse],
) -> String {
    let unit = member
        .business_unit_id
        .and_then(|unit_id| business_units.iter().find(|unit| unit.id == unit_id));
    let business_id = member.business_id.or(unit.map(|unit| unit.business_id));
    let business = business_id.and_then(|id| businesses.iter().find(|item| item.id == id));

    match (business, unit) {
        (Some(business), Some(unit)) => format!("{} / {}", business.name, unit.name),
        (Some(business), None) => business.name.clone(),
        _ => "Workspace access".to_string(),
    }
}

fn has_permission(permissions: &[String], permission: &str) -> bool {
    permissions.iter().any(|value| value == permission)
}

fn custom_baseline_role_code(role_code: &str) -> Option<&'static str> {
    let custom_code = role_code.strip_prefix(CUSTOM_ROLE_PREFIX)?;
    if custom_code.starts_with("business_admin_") {
        Some("business_admin")
    } else if custom_code.starts_with("shop_manager_") {
        Some("shop_manager")
    } else if custom_code.starts_with("cashier_") {
        Some("cashier")
    } else {
        None
    }
}

fn baseline_role_code(role_code: &str) -> &str {
    custom_baseline_role_code(role_code).unwrap_or(role_code)
}

fn is_custom_baseline_role(role_code: &str) -> bool {
    matches!(role_code, "business_admin" | "shop_manager" | "cashier")
}

fn dashboards_for_member(
    member: &TeamMemberResponse,
    permissions: &[String],
) -> Vec<DashboardOptionResponse> {
    let mut dashboards = Vec::new();
    let baseline_code = baseline_role_code(&member.role_code);

    match baseline_code {
        "business_admin" => dashboards.push(dashboard(
            "business_dashboard",
            "Business dashboard",
            "Business-wide view for granted businesses and units.",
            "/dashboard?view=business",
            "business",
            None,
            true,
        )),
        "shop_manager" => dashboards.push(dashboard(
            "shop_dashboard",
            "Shop dashboard",
            "Shop-level operations view for the assigned unit.",
            "/dashboard?view=shop",
            "shop",
            None,
            true,
        )),
        "cashier" => dashboards.push(dashboard(
            "personal_dashboard",
            "Personal cashier dashboard",
            "Your own sales, drafts, and assigned work queue.",
            "/dashboard?view=personal",
            "personal",
            None,
            true,
        )),
        "master_owner" => dashboards.push(dashboard(
            "master_dashboard",
            "Master dashboard",
            "Account-wide dashboard for all businesses and units.",
            "/dashboard?view=master",
            "master",
            None,
            true,
        )),
        _ => dashboards.push(dashboard(
            "custom_dashboard",
            "Custom dashboard",
            "Dashboard assembled from this user's validated custom permissions.",
            "/dashboard?view=custom",
            "custom",
            None,
            true,
        )),
    }

    if baseline_code == "cashier"
        && member.business_unit_id.is_some()
        && (has_permission(permissions, "screen.reports")
            || has_permission(permissions, "report.view")
            || has_permission(permissions, "worker.view"))
    {
        dashboards.push(dashboard(
            "shop_dashboard",
            "Shop dashboard",
            "Additional shop information granted to this cashier.",
            "/dashboard?view=shop",
            "shop",
            None,
            false,
        ));
    }

    if (member.business_id.is_some() || baseline_code == "business_admin")
        && has_permission(permissions, "screen.businesses")
    {
        dashboards.push(dashboard(
            "business_structure",
            "Business structure",
            "Granted access to businesses and units.",
            "/businesses",
            "business_structure",
            Some("businesses"),
            false,
        ));
    }

    add_if_allowed(
        &mut dashboards,
        permissions,
        "screen.record_transaction",
        dashboard(
            "record_transaction",
            "Record sale",
            "Create a sale for the assigned scope.",
            "/transactions/new",
            "workflow",
            Some("recordTransaction"),
            false,
        ),
    );
    add_if_allowed(
        &mut dashboards,
        permissions,
        "screen.transaction_drafts",
        dashboard(
            "transaction_drafts",
            "Drafts",
            "Continue saved transaction drafts.",
            "/transactions/drafts",
            "workflow",
            Some("transactionDrafts"),
            false,
        ),
    );
    add_if_allowed(
        &mut dashboards,
        permissions,
        "screen.transactions",
        dashboard(
            "transactions",
            "Transactions",
            "Review transactions validated for this role.",
            "/transactions",
            "workflow",
            Some("transactions"),
            false,
        ),
    );
    add_if_allowed(
        &mut dashboards,
        permissions,
        "screen.products",
        dashboard(
            "products",
            "Products",
            "Open products within the validated scope.",
            "/products",
            "workflow",
            Some("products"),
            false,
        ),
    );
    add_if_allowed(
        &mut dashboards,
        permissions,
        "screen.team",
        dashboard(
            "team_access",
            "Team access",
            "Manage employees where this role is permitted.",
            "/team",
            "workflow",
            Some("team"),
            false,
        ),
    );
    add_if_allowed(
        &mut dashboards,
        permissions,
        "screen.reports",
        dashboard(
            "reports",
            "Reports",
            "Open reports validated for this role and scope.",
            "/reports",
            "workflow",
            Some("reports"),
            false,
        ),
    );

    dashboards
}

fn add_if_allowed(
    dashboards: &mut Vec<DashboardOptionResponse>,
    permissions: &[String],
    permission: &str,
    option: DashboardOptionResponse,
) {
    if has_permission(permissions, permission) && !dashboards.iter().any(|item| item.id == option.id) {
        dashboards.push(option);
    }
}

fn dashboard(
    id: &str,
    label: &str,
    description: &str,
    path: &str,
    dashboard_type: &str,
    route_key: Option<&str>,
    is_baseline: bool,
) -> DashboardOptionResponse {
    DashboardOptionResponse {
        id: id.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        path: path.to_string(),
        dashboard_type: dashboard_type.to_string(),
        route_key: route_key.map(str::to_string),
        is_baseline,
    }
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
        let baseline_role_id = payload.role_id.unwrap_or(current.role_id);
        let roles = repository::list_roles(db, actor_id).await?;
        let baseline_role = roles
            .iter()
            .find(|role| role.id == baseline_role_id)
            .ok_or(ApiError::Forbidden)?;
        if !is_custom_baseline_role(&baseline_role.code) {
            return Err(ApiError::BadRequest(
                "custom roles must start from cashier, shop manager, or business admin".to_string(),
            ));
        }
        if !repository::role_is_assignable(db, account_id, baseline_role.id).await? {
            return Err(ApiError::Forbidden);
        }
        if !repository::validate_role_scope(db, account_id, baseline_role.id, business_id, unit_id)
            .await?
        {
            return Err(ApiError::Forbidden);
        }

        let mut permissions = baseline_role.permissions.clone();
        permissions.extend(custom_permissions);
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
            &baseline_role.code,
            &baseline_role.name,
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
