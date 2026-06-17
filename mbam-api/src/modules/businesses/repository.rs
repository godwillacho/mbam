//! Business database access.

use sqlx::PgPool;
use uuid::Uuid;

use super::model::Business;

pub async fn permitted_account_id(
    db: &PgPool,
    user_id: Uuid,
    permission: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select m.business_account_id
        from memberships m
        join business_accounts ba on ba.id = m.business_account_id
        join role_permissions rp on rp.role_id = m.role_id
        join permissions p on p.id = rp.permission_id
        where m.user_id = $1
          and m.status = 'active'
          and m.business_id is null
          and m.business_unit_id is null
          and ba.status = 'active'
          and p.code = $2
        order by (ba.owner_user_id = $1) desc, m.created_at
        limit 1
        "#,
    )
    .bind(user_id)
    .bind(permission)
    .fetch_optional(db)
    .await
}

pub async fn list_for_user(db: &PgPool, user_id: Uuid) -> Result<Vec<Business>, sqlx::Error> {
    sqlx::query_as::<_, Business>(
        r#"
        select distinct
          b.id,
          b.business_account_id,
          b.name,
          b.business_type,
          b.country,
          b.currency,
          b.status,
          b.created_at,
          b.updated_at
        from businesses b
        join business_accounts ba
          on ba.id = b.business_account_id
         and ba.status = 'active'
        join memberships m on m.business_account_id = b.business_account_id
        join role_permissions rp on rp.role_id = m.role_id
        join permissions p on p.id = rp.permission_id and p.code = 'business.view'
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
          and b.status = 'active'
          and (
            m.business_id is null
            or m.business_id = b.id
            or business_scope.business_id is not null
            or scoped_unit.id is not null
          )
        order by b.created_at, b.name
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn name_exists(
    db: &PgPool,
    business_account_id: Uuid,
    name: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1
          from businesses
          where business_account_id = $1
            and lower(name) = lower($2)
        )
        "#,
    )
    .bind(business_account_id)
    .bind(name)
    .fetch_one(db)
    .await
}

pub async fn create(
    db: &PgPool,
    actor_user_id: Uuid,
    business_account_id: Uuid,
    name: &str,
    business_type: Option<&str>,
    country: Option<&str>,
    currency: &str,
) -> Result<Business, sqlx::Error> {
    let mut tx = db.begin().await?;

    let business = sqlx::query_as::<_, Business>(
        r#"
        insert into businesses (
          business_account_id,
          name,
          business_type,
          country,
          currency,
          status
        )
        values ($1, $2, $3, $4, $5, 'active')
        returning
          id,
          business_account_id,
          name,
          business_type,
          country,
          currency,
          status,
          created_at,
          updated_at
        "#,
    )
    .bind(business_account_id)
    .bind(name)
    .bind(business_type)
    .bind(country)
    .bind(currency)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id,
          business_account_id,
          business_id,
          action,
          resource_type,
          resource_id
        )
        values ($1, $2, $3, 'business.create', 'business', $3)
        "#,
    )
    .bind(actor_user_id)
    .bind(business_account_id)
    .bind(business.id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(business)
}
