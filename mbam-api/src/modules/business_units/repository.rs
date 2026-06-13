use sqlx::PgPool;
use uuid::Uuid;

use super::model::BusinessUnit;

pub struct UpdateUnitParams<'a> {
    pub actor_id: Uuid,
    pub account_id: Uuid,
    pub business_id: Uuid,
    pub unit_id: Uuid,
    pub name: &'a str,
    pub unit_type: &'a str,
    pub location: Option<&'a str>,
    pub status: &'a str,
}

pub async fn list_for_business(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
) -> Result<Vec<BusinessUnit>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct unit.*
        from business_units unit
        join memberships membership
          on membership.business_account_id = unit.business_account_id
         and (membership.business_id is null or membership.business_id = unit.business_id)
         and (membership.business_unit_id is null or membership.business_unit_id = unit.id)
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission
          on permission.id = role_permission.permission_id
         and permission.code = 'unit.view'
        where membership.user_id = $1 and membership.status = 'active'
          and unit.business_id = $2
        order by unit.created_at, unit.name
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .fetch_all(db)
    .await
}

pub async fn permitted_account_id(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    permission: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select membership.business_account_id
        from memberships membership
        join businesses business
          on business.id = $2
         and business.business_account_id = membership.business_account_id
         and business.status = 'active'
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions granted on granted.id = role_permission.permission_id
        where membership.user_id = $1 and membership.status = 'active'
          and (membership.business_id is null or membership.business_id = $2)
          and membership.business_unit_id is null
          and granted.code = $3
        limit 1
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .bind(permission)
    .fetch_optional(db)
    .await
}

pub async fn name_exists(
    db: &PgPool,
    business_id: Uuid,
    unit_id: Option<Uuid>,
    name: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1 from business_units
          where business_id = $1 and lower(name) = lower($3)
            and ($2::uuid is null or id <> $2)
        )
        "#,
    )
    .bind(business_id)
    .bind(unit_id)
    .bind(name)
    .fetch_one(db)
    .await
}

pub async fn create(
    db: &PgPool,
    actor_id: Uuid,
    account_id: Uuid,
    business_id: Uuid,
    name: &str,
    unit_type: &str,
    location: Option<&str>,
) -> Result<BusinessUnit, sqlx::Error> {
    let mut tx = db.begin().await?;
    let unit = sqlx::query_as::<_, BusinessUnit>(
        r#"
        insert into business_units (
          business_account_id, business_id, name, unit_type, location
        ) values ($1, $2, $3, $4, $5)
        returning *
        "#,
    )
    .bind(account_id)
    .bind(business_id)
    .bind(name)
    .bind(unit_type)
    .bind(location)
    .fetch_one(&mut *tx)
    .await?;
    audit(
        &mut tx,
        actor_id,
        account_id,
        business_id,
        unit.id,
        "unit.create",
    )
    .await?;
    tx.commit().await?;
    Ok(unit)
}

pub async fn update(
    db: &PgPool,
    params: UpdateUnitParams<'_>,
) -> Result<Option<BusinessUnit>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let unit = sqlx::query_as(
        r#"
        update business_units set name = $4, unit_type = $5, location = $6,
          status = $7, updated_at = now()
        where id = $1 and business_account_id = $2 and business_id = $3
        returning *
        "#,
    )
    .bind(params.unit_id)
    .bind(params.account_id)
    .bind(params.business_id)
    .bind(params.name)
    .bind(params.unit_type)
    .bind(params.location)
    .bind(params.status)
    .fetch_optional(&mut *tx)
    .await?;
    if unit.is_some() {
        audit(
            &mut tx,
            params.actor_id,
            params.account_id,
            params.business_id,
            params.unit_id,
            "unit.update",
        )
        .await?;
    }
    tx.commit().await?;
    Ok(unit)
}

async fn audit(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor_id: Uuid,
    account_id: Uuid,
    business_id: Uuid,
    unit_id: Uuid,
    action: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, business_id, business_unit_id,
          action, resource_type, resource_id
        ) values ($1, $2, $3, $4, $5, 'business_unit', $4)
        "#,
    )
    .bind(actor_id)
    .bind(account_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(action)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
