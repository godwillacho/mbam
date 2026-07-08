use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::auth::BaselineRole;

use super::model::{OutboxJob, SyncStatusResponse};

/// Queues the latest Keycloak baseline-role state inside a membership transaction.
pub async fn enqueue_membership_reconciliation(
    tx: &mut Transaction<'_, Postgres>,
    membership_id: Uuid,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query_as::<_, (Uuid, Uuid)>(
        "select user_id, business_account_id from memberships where id = $1",
    )
    .bind(membership_id)
    .fetch_one(&mut **tx)
    .await?;
    let role_codes = sqlx::query_scalar::<_, String>(
        r#"
        select distinct role.code
        from memberships membership
        join roles role on role.id = membership.role_id
        where membership.user_id = $1 and membership.status = 'active'
        order by role.code
        "#,
    )
    .bind(row.0)
    .fetch_all(&mut **tx)
    .await?;
    let baselines = role_codes
        .iter()
        .filter_map(|code| BaselineRole::from_local_role_code(code))
        .collect::<std::collections::BTreeSet<_>>();
    if !role_codes.is_empty() && (baselines.len() != 1 || baselines.len() != role_codes.len()) {
        return Err(sqlx::Error::Protocol(
            "active memberships must resolve to one baseline role".to_string(),
        ));
    }
    let desired = baselines.iter().next().map(|baseline| baseline.code());

    sqlx::query(
        r#"
        update keycloak_role_outbox
        set status = 'superseded', updated_at = now()
        where membership_id = $1 and status in ('pending', 'processing', 'failed')
        "#,
    )
    .bind(membership_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        r#"
        insert into keycloak_role_outbox (
          membership_id, user_id, business_account_id, desired_baseline_role
        ) values ($1, $2, $3, $4)
        "#,
    )
    .bind(membership_id)
    .bind(row.0)
    .bind(row.1)
    .bind(desired)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn claim(db: &PgPool) -> Result<Option<OutboxJob>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let job = sqlx::query_as::<_, OutboxJob>(
        r#"
        with candidate as (
          select id
          from keycloak_role_outbox
          where status in ('pending', 'failed') and available_at <= now()
          order by created_at
          for update skip locked
          limit 1
        )
        update keycloak_role_outbox outbox
        set status = 'processing', attempts = attempts + 1, updated_at = now()
        from candidate
        where outbox.id = candidate.id
        returning outbox.id, outbox.membership_id, outbox.user_id,
          outbox.business_account_id, outbox.desired_baseline_role, outbox.attempts
        "#,
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(job)
}

pub async fn keycloak_subject(db: &PgPool, user_id: Uuid) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select provider_user_id
        from auth_identities
        where user_id = $1 and provider = 'keycloak'
        "#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
}

pub async fn succeed(db: &PgPool, job: &OutboxJob) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    sqlx::query(
        r#"
        update keycloak_role_outbox
        set status = 'succeeded', last_error = null, completed_at = now(), updated_at = now()
        where id = $1
        "#,
    )
    .bind(job.id)
    .execute(&mut *tx)
    .await?;
    audit(&mut tx, job, "keycloak.role.sync.succeeded").await?;
    tx.commit().await
}

pub async fn fail(db: &PgPool, job: &OutboxJob, error: &str) -> Result<(), sqlx::Error> {
    let delay_seconds = i64::from(job.attempts.clamp(1, 8)).pow(2) * 15;
    let mut tx = db.begin().await?;
    sqlx::query(
        r#"
        update keycloak_role_outbox
        set status = 'failed', last_error = $2,
          available_at = now() + make_interval(secs => $3),
          updated_at = now()
        where id = $1
        "#,
    )
    .bind(job.id)
    .bind(error)
    .bind(delay_seconds as f64)
    .execute(&mut *tx)
    .await?;
    audit(&mut tx, job, "keycloak.role.sync.failed").await?;
    tx.commit().await
}

pub async fn statuses(
    db: &PgPool,
    membership_ids: &[Uuid],
) -> Result<Vec<SyncStatusResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct on (membership_id)
          membership_id, status, attempts, last_error, updated_at
        from keycloak_role_outbox
        where membership_id = any($1)
        order by membership_id, created_at desc
        "#,
    )
    .bind(membership_ids)
    .fetch_all(db)
    .await
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    job: &OutboxJob,
    action: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into audit_logs (
          business_account_id, action, resource_type, resource_id
        ) values ($1, $2, 'membership', $3)
        "#,
    )
    .bind(job.business_account_id)
    .bind(action)
    .bind(job.membership_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
