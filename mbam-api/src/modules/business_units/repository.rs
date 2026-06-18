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

pub async fn permitted_account_id(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    permission: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select m.business_account_id
        from memberships m
        join businesses b
          on b.id = $2
         and b.business_account_id = m.business_account_id
         and b.status = 'active'
        join role_permissions rp on rp.role_id = m.role_id
        join permissions p on p.id = rp.permission_id and p.code = $3
        left join membership_business_scopes business_scope
          on business_scope.membership_id = m.id
         and business_scope.business_id = b.id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = m.id
        left join business_units scoped_unit
          on scoped_unit.id = unit_scope.business_unit_id
         and scoped_unit.business_id = b.id
         and scoped_unit.status = 'active'
        where m.user_id = $1
          and m.status = 'active'
          and m.business_unit_id is null
          and (
            m.business_id is null
            or m.business_id = $2
            or business_scope.business_id is not null
            or scoped_unit.id is not null
          )
        order by (m.business_id is null) desc, (business_scope.business_id is not null) desc
        limit 1
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .bind(permission)
    .fetch_optional(db)
    .await
}

pub async fn list_for_business(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
) -> Result<Vec<BusinessUnit>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct
          bu.id, bu.business_account_id, bu.business_id, bu.name, bu.unit_type,
          bu.location, bu.status, bu.created_at, bu.updated_at
        from business_units bu
        join memberships m on m.business_account_id = bu.business_account_id
        join role_permissions rp on rp.role_id = m.role_id
        join permissions p on p.id = rp.permission_id and p.code = 'unit.view'
        left join membership_business_scopes business_scope
          on business_scope.membership_id = m.id
         and business_scope.business_id = bu.business_id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = m.id
         and unit_scope.business_unit_id = bu.id
        where m.user_id = $1
          and m.status = 'active'
          and bu.business_id = $2
          and bu.status = 'active'
          and (
            m.business_id is null
            or m.business_id = bu.business_id
            or business_scope.business_id is not null
            or unit_scope.business_unit_id is not null
          )
          and (
            m.business_unit_id is null
            or m.business_unit_id = bu.id
            or unit_scope.business_unit_id is not null
          )
        order by bu.name
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .fetch_all(db)
    .await
}

pub async fn name_exists(db: &PgPool, business_id: Uuid, name: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1 from business_units
          where business_id = $1 and lower(name) = lower($2) and status = 'active'
        )
        "#,
    )
    .bind(business_id)
    .bind(name)
    .fetch_one(db)
    .await
}

pub async fn name_exists_for_other_unit(
    db: &PgPool,
    business_id: Uuid,
    unit_id: Uuid,
    name: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1 from business_units
          where business_id = $1
            and id <> $2
            and lower(name) = lower($3)
            and status = 'active'
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
    actor_user_id: Uuid,
    business_account_id: Uuid,
    business_id: Uuid,
    name: &str,
    unit_type: &str,
    location: Option<&str>,
) -> Result<BusinessUnit, sqlx::Error> {
    let mut tx = db.begin().await?;
    let unit = sqlx::query_as::<_, BusinessUnit>(
        r#"
        insert into business_units (
          business_account_id, business_id, name, unit_type, location, status
        ) values ($1, $2, $3, $4, $5, 'active')
        returning id, business_account_id, business_id, name, unit_type,
          location, status, created_at, updated_at
        "#,
    )
    .bind(business_account_id)
    .bind(business_id)
    .bind(name)
    .bind(unit_type)
    .bind(location)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, business_id, business_unit_id,
          action, resource_type, resource_id
        ) values ($1, $2, $3, $4, 'unit.create', 'business_unit', $4)
        "#,
    )
    .bind(actor_user_id)
    .bind(business_account_id)
    .bind(business_id)
    .bind(unit.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(unit)
}

pub async fn update(
    db: &PgPool,
    params: UpdateUnitParams<'_>,
) -> Result<Option<BusinessUnit>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let unit = sqlx::query_as::<_, BusinessUnit>(
        r#"
        update business_units set name = $4, unit_type = $5, location = $6,
          status = $7, updated_at = now()
        where id = $1 and business_account_id = $2 and business_id = $3
        returning id, business_account_id, business_id, name, unit_type,
          location, status, created_at, updated_at
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
