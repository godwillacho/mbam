use sqlx::PgPool;
use uuid::Uuid;

use super::model::BusinessUnit;

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
        where m.user_id = $1
          and m.status = 'active'
          and (m.business_id is null or m.business_id = $2)
          and m.business_unit_id is null
        order by (m.business_id is null) desc
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
        where m.user_id = $1
          and m.status = 'active'
          and bu.business_id = $2
          and bu.status = 'active'
          and (m.business_id is null or m.business_id = bu.business_id)
          and (m.business_unit_id is null or m.business_unit_id = bu.id)
        order by bu.name
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .fetch_all(db)
    .await
}

pub async fn name_exists(
    db: &PgPool,
    business_id: Uuid,
    name: &str,
) -> Result<bool, sqlx::Error> {
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
