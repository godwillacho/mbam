use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::authentication::AuthorizationContext;

pub async fn record_authorization_event(
    db: &PgPool,
    authorization: &AuthorizationContext,
    action: &str,
    resource_type: &str,
    resource_id: Option<Uuid>,
    business_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
    metadata: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, business_id, business_unit_id,
          action, resource_type, resource_id, metadata
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(authorization.user_id)
    .bind(
        authorization
            .authorized_business_account_ids
            .iter()
            .next()
            .copied(),
    )
    .bind(business_id)
    .bind(business_unit_id)
    .bind(action)
    .bind(resource_type)
    .bind(resource_id)
    .bind(metadata)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn record_user_session_event(
    db: &PgPool,
    user_id: Uuid,
    action: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, action, resource_type, resource_id
        )
        select business_account.user_id, business_account.business_account_id, $2, 'user', business_account.user_id
        from (
          select $1::uuid as user_id, memberships.business_account_id
          from memberships
          where memberships.user_id = $1
          order by memberships.created_at
          limit 1
        ) as business_account
        "#,
    )
    .bind(user_id)
    .bind(action)
    .execute(db)
    .await?;
    Ok(())
}
