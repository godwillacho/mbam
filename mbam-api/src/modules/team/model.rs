use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RoleResponse {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TeamMemberResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub full_name: String,
    pub email: String,
    pub phone: Option<String>,
    pub role_id: Uuid,
    pub role_code: String,
    pub role_name: String,
    pub business_account_id: Uuid,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
    pub status: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PendingInvitationResponse {
    pub id: Uuid,
    pub email: String,
    pub role_id: Uuid,
    pub role_code: String,
    pub role_name: String,
    pub business_account_id: Uuid,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
    pub status: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BusinessScopeResponse {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UnitScopeResponse {
    pub id: Uuid,
    pub business_id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardOptionResponse {
    pub id: String,
    pub label: String,
    pub description: String,
    pub path: String,
    pub dashboard_type: String,
    pub route_key: Option<String>,
    pub is_baseline: bool,
}

#[derive(Debug, Serialize)]
pub struct DashboardProfileResponse {
    pub membership_id: Uuid,
    pub user_id: Uuid,
    pub role_code: String,
    pub role_name: String,
    pub scope_level: String,
    pub scope_label: String,
    pub base_dashboard_id: String,
    pub permissions: Vec<String>,
    pub dashboards: Vec<DashboardOptionResponse>,
}

#[derive(Debug, Serialize)]
pub struct TeamWorkspaceResponse {
    pub members: Vec<TeamMemberResponse>,
    pub invitations: Vec<PendingInvitationResponse>,
    pub roles: Vec<RoleResponse>,
    pub businesses: Vec<BusinessScopeResponse>,
    pub business_units: Vec<UnitScopeResponse>,
    pub dashboard_profiles: Vec<DashboardProfileResponse>,
    pub authorization_version: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvitationRequest {
    pub email: String,
    pub role_id: Uuid,
    pub business_id: Option<Uuid>,
    pub business_unit_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct CreateInvitationResponse {
    pub invitation: PendingInvitationResponse,
    pub invite_url: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTeamMemberRequest {
    pub role_id: Option<Uuid>,
    pub custom_permissions: Option<Vec<String>>,
    pub business_id: Option<Option<Uuid>>,
    pub business_unit_id: Option<Option<Uuid>>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterInvitationRequest {
    pub token: String,
    pub full_name: String,
    pub password: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct InvitationDetailsResponse {
    pub id: Uuid,
    pub email: String,
    pub role_name: String,
    pub business_name: Option<String>,
    pub business_unit_name: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub status: String,
}
