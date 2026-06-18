use sqlx::PgPool;
use uuid::Uuid;

use super::model::{AuthorizedBusinessResponse, AuthorizedBusinessUnitResponse};

/// Loads names for business IDs already validated by the authorization context.
///
/// Inputs are the database pool and validated business IDs; output contains
/// active businesses in deterministic name order. Missing or disabled records
/// are omitted and database failures are returned. This function does not
/// authenticate the caller or expand scope beyond the supplied identifiers.
pub async fn businesses(
    db: &PgPool,
    business_ids: &[Uuid],
) -> Result<Vec<AuthorizedBusinessResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select id, name
        from businesses
        where id = any($1) and status = 'active'
        order by name, id
        "#,
    )
    .bind(business_ids)
    .fetch_all(db)
    .await
}

/// Loads names for business-unit IDs already validated by the authorization context.
///
/// Inputs are the database pool and validated unit IDs; output contains active
/// units in deterministic name order. Missing or disabled records are omitted
/// and database failures are returned. This function does not authenticate the
/// caller or infer additional unit scope.
pub async fn business_units(
    db: &PgPool,
    business_unit_ids: &[Uuid],
) -> Result<Vec<AuthorizedBusinessUnitResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select id, business_id, name
        from business_units
        where id = any($1) and status = 'active'
        order by name, id
        "#,
    )
    .bind(business_unit_ids)
    .fetch_all(db)
    .await
}

/// Loads canonical baseline permissions for the user's authorized accounts.
///
/// Inputs are validated account IDs and one recognized baseline role code;
/// output is the distinct permission set assigned to that standard role.
/// Missing role rows produce an empty list and database failures are returned.
/// This function does not grant permissions or include custom-role additions.
pub async fn baseline_permissions(
    db: &PgPool,
    business_account_ids: &[Uuid],
    baseline_role: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select distinct permission.code
        from roles role
        join role_permissions role_permission on role_permission.role_id = role.id
        join permissions permission on permission.id = role_permission.permission_id
        where role.business_account_id = any($1)
          and role.code = $2
        order by permission.code
        "#,
    )
    .bind(business_account_ids)
    .bind(baseline_role)
    .fetch_all(db)
    .await
}
