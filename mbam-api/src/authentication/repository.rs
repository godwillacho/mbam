use std::collections::BTreeSet;

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    authentication::context::{AuthorizationGrant, BaselineRole},
    error::ApiError,
};

/// Active local identity fields required to build an authorization context.
#[derive(Debug, sqlx::FromRow)]
pub struct AuthorizationUser {
    pub id: Uuid,
    pub full_name: String,
    pub email: String,
    pub authorization_version: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct AuthorizationGrantRow {
    membership_id: Uuid,
    business_account_id: Uuid,
    role_code: String,
    permissions: Vec<String>,
    business_ids: Vec<Uuid>,
    business_unit_ids: Vec<Uuid>,
}

/// Resolves a verified Keycloak subject to an active local Mbam user.
///
/// Inputs are the database pool, immutable Keycloak subject, optional email
/// claims, verification state, and migration-linking policy; output is the
/// active local user ID. Unknown subjects return `401` unless controlled linking
/// is enabled with a verified matching email. Database failures use the central
/// API error. This function assumes token validation already succeeded and does
/// not load membership, compare roles, or authorize business data.
pub async fn resolve_keycloak_user(
    db: &PgPool,
    subject: &str,
    email: Option<&str>,
    email_verified: bool,
    allow_verified_email_linking: bool,
) -> Result<Uuid, ApiError> {
    if let Some(user_id) = find_user_by_keycloak_subject(db, subject).await? {
        return Ok(user_id);
    }

    if !allow_verified_email_linking || !email_verified {
        return Err(ApiError::Unauthorized);
    }

    let normalized_email = email
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase)
        .ok_or(ApiError::Unauthorized)?;
    let user_id = sqlx::query_scalar::<_, Uuid>(
        "select id from users where lower(email) = $1 and status = 'active'",
    )
    .bind(&normalized_email)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::Unauthorized)?;

    sqlx::query(
        r#"
        insert into auth_identities (user_id, provider, provider_user_id, provider_email)
        values ($1, 'keycloak', $2, $3)
        on conflict (provider, provider_user_id) do nothing
        "#,
    )
    .bind(user_id)
    .bind(subject)
    .bind(&normalized_email)
    .execute(db)
    .await?;

    find_user_by_keycloak_subject(db, subject)
        .await?
        .ok_or(ApiError::Unauthorized)
}

/// Loads an active Mbam user for normalized request authorization.
///
/// Input is a verified local user identifier and output is the non-sensitive
/// identity profile plus durable authorization version. Missing or disabled
/// users return `401`; database failures use the central API error. This
/// function does not validate a token or grant domain access.
pub async fn authorization_user(db: &PgPool, user_id: Uuid) -> Result<AuthorizationUser, ApiError> {
    sqlx::query_as(
        r#"
        select id, full_name, email, authorization_version
        from users
        where id = $1 and status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::Unauthorized)
}

/// Loads active membership grants with permissions and expanded resource scope.
///
/// Input is an active local user identifier and output is one grant per active
/// membership. Account and business assignments are expanded only to active
/// businesses and units in the same account. Unknown local role codes return
/// `401`; database failures use the central API error. This function does not
/// compare Keycloak claims or authorize a specific operation.
pub async fn authorization_grants(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<AuthorizationGrant>, ApiError> {
    let rows = sqlx::query_as::<_, AuthorizationGrantRow>(
        r#"
        select
          m.id as membership_id,
          m.business_account_id,
          r.code as role_code,
          coalesce((
            select array_agg(distinct p.code order by p.code)
            from role_permissions rp
            join permissions p on p.id = rp.permission_id
            where rp.role_id = m.role_id
          ), array[]::text[]) as permissions,
          coalesce((
            select array_agg(distinct business.id order by business.id)
            from businesses business
            where business.business_account_id = m.business_account_id
              and business.status = 'active'
              and (
                (m.business_id is null and m.business_unit_id is null)
                or business.id = m.business_id
                or exists (
                  select 1
                  from membership_business_scopes business_scope
                  where business_scope.membership_id = m.id
                    and business_scope.business_id = business.id
                )
                or exists (
                  select 1
                  from business_units direct_unit
                  where direct_unit.id = m.business_unit_id
                    and direct_unit.business_id = business.id
                    and direct_unit.status = 'active'
                )
                or exists (
                  select 1
                  from membership_business_unit_scopes unit_scope
                  join business_units scoped_unit
                    on scoped_unit.id = unit_scope.business_unit_id
                   and scoped_unit.business_id = business.id
                   and scoped_unit.status = 'active'
                  where unit_scope.membership_id = m.id
                )
              )
          ), array[]::uuid[]) as business_ids,
          coalesce((
            select array_agg(distinct unit.id order by unit.id)
            from business_units unit
            where unit.business_account_id = m.business_account_id
              and unit.status = 'active'
              and (
                (m.business_id is null and m.business_unit_id is null)
                or (m.business_id = unit.business_id and m.business_unit_id is null)
                or m.business_unit_id = unit.id
                or exists (
                  select 1
                  from membership_business_scopes business_scope
                  where business_scope.membership_id = m.id
                    and business_scope.business_id = unit.business_id
                )
                or exists (
                  select 1
                  from membership_business_unit_scopes unit_scope
                  where unit_scope.membership_id = m.id
                    and unit_scope.business_unit_id = unit.id
                )
              )
          ), array[]::uuid[]) as business_unit_ids
        from memberships m
        join roles r on r.id = m.role_id
        join business_accounts account
          on account.id = m.business_account_id
         and account.status = 'active'
        where m.user_id = $1
          and m.status = 'active'
        order by m.created_at, m.id
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    rows.into_iter()
        .map(|row| {
            let baseline_role =
                BaselineRole::from_local_role_code(&row.role_code).ok_or(ApiError::Unauthorized)?;
            Ok(AuthorizationGrant {
                membership_id: row.membership_id,
                business_account_id: row.business_account_id,
                baseline_role,
                permissions: row.permissions.into_iter().collect::<BTreeSet<_>>(),
                business_ids: row.business_ids.into_iter().collect::<BTreeSet<_>>(),
                business_unit_ids: row.business_unit_ids.into_iter().collect::<BTreeSet<_>>(),
            })
        })
        .collect()
}

/// Looks up an active local user through the immutable Keycloak subject claim.
async fn find_user_by_keycloak_subject(
    db: &PgPool,
    subject: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        select u.id
        from auth_identities identity
        join users u on u.id = identity.user_id
        where identity.provider = 'keycloak'
          and identity.provider_user_id = $1
          and u.status = 'active'
        "#,
    )
    .bind(subject)
    .fetch_optional(db)
    .await
}
