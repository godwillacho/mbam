use serde::Serialize;
use uuid::Uuid;

/// Authenticated identity fields safe for the current user's bootstrap response.
#[derive(Debug, Serialize)]
pub struct AuthorizationIdentityResponse {
    pub user_id: Uuid,
    pub keycloak_subject: Option<String>,
    pub full_name: String,
    pub email: String,
}

/// One authorized business visible to the authenticated user.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AuthorizedBusinessResponse {
    pub id: Uuid,
    pub name: String,
}

/// One authorized business unit visible to the authenticated user.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AuthorizedBusinessUnitResponse {
    pub id: Uuid,
    pub business_id: Uuid,
    pub name: String,
}

/// One server-approved frontend route derived from role, permission, and scope.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct AuthorizedRouteResponse {
    pub key: String,
    pub path: String,
}

/// Sole online authorization bootstrap returned to the authenticated frontend.
#[derive(Debug, Serialize)]
pub struct AuthorizationBootstrapResponse {
    pub identity: AuthorizationIdentityResponse,
    pub baseline_role: String,
    pub permissions: Vec<String>,
    pub custom_permissions: Vec<String>,
    pub active_membership_ids: Vec<Uuid>,
    pub authorized_business_account_ids: Vec<Uuid>,
    pub businesses: Vec<AuthorizedBusinessResponse>,
    pub business_units: Vec<AuthorizedBusinessUnitResponse>,
    pub dashboard_type: String,
    pub dashboard_path: String,
    pub authorized_routes: Vec<AuthorizedRouteResponse>,
    pub authorization_version: i64,
}
