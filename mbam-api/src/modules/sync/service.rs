use chrono::Utc;
use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::error::ApiError;

use super::model::{
    CloudChange, SyncAuthorizationScope, SyncPullResult, SyncPushRequest, SyncPushResult,
};

pub async fn pull(
    db: &PgPool,
    user_id: Uuid,
    cursor: Option<&str>,
    device_id: Option<Uuid>,
) -> Result<SyncPullResult, ApiError> {
    let run_id = start_run(db, user_id, device_id, "pull", cursor, 0).await?;
    let result = build_snapshot(db, user_id, run_id).await;
    match result {
        Ok(snapshot) => {
            finish_run(
                db,
                run_id,
                "completed",
                Some(&snapshot.cursor),
                snapshot.changes.len() as i32,
                0,
                None,
            )
            .await?;
            Ok(snapshot)
        }
        Err(error) => {
            let message = error.to_string();
            finish_run(db, run_id, "failed", None, 0, 0, Some(&message)).await?;
            Err(error)
        }
    }
}

pub async fn push(
    db: &PgPool,
    user_id: Uuid,
    payload: SyncPushRequest,
) -> Result<Vec<SyncPushResult>, ApiError> {
    let run_id = start_run(
        db,
        user_id,
        payload.device_id,
        "push",
        None,
        payload.operations.len() as i32,
    )
    .await?;
    let can_push: bool = sqlx::query_scalar(
        r#"
        select exists(
          select 1 from memberships m
          join role_permissions rp on rp.role_id = m.role_id
          join permissions p on p.id = rp.permission_id
          where m.user_id = $1 and m.status = 'active' and p.code = 'sync.push'
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    let results = payload
        .operations
        .iter()
        .map(|operation| {
            let operation_id = operation
                .get("operationId")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            SyncPushResult {
                operation_id,
                outcome: "rejected".to_string(),
                error: Some(if can_push {
                    "this entity type does not yet have a server sync handler".to_string()
                } else {
                    "role does not grant offline upload access".to_string()
                }),
            }
        })
        .collect::<Vec<_>>();
    finish_run(db, run_id, "completed", None, 0, results.len() as i32, None).await?;
    Ok(results)
}

async fn build_snapshot(
    db: &PgPool,
    user_id: Uuid,
    run_id: Uuid,
) -> Result<SyncPullResult, ApiError> {
    let can_pull: bool = sqlx::query_scalar(
        r#"
        select exists(
          select 1 from memberships m
          join role_permissions rp on rp.role_id = m.role_id
          join permissions p on p.id = rp.permission_id
          where m.user_id = $1 and m.status = 'active' and p.code = 'sync.pull'
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    if !can_pull {
        return Ok(SyncPullResult {
            cursor: Utc::now().to_rfc3339(),
            user_id,
            authorization_version: Utc::now().timestamp_millis(),
            allowed_business_ids: Vec::new(),
            allowed_business_unit_ids: Vec::new(),
            permissions: Vec::new(),
            restrict_to_own_records: true,
            authorization_scopes: Vec::new(),
            allowed_entity_keys: Vec::new(),
            changes: Vec::new(),
            sync_run_id: run_id,
        });
    }

    let rows = sqlx::query(
        r#"
        with actor_memberships as (
          select m.* from memberships m
          join role_permissions rp on rp.role_id = m.role_id
          join permissions p on p.id = rp.permission_id
          where m.user_id = $1 and m.status = 'active' and p.code = 'sync.pull'
        ),
        visible_businesses as (
          select distinct b.id, b.name, b.business_type, b.country, b.currency, b.status, b.updated_at
          from businesses b join actor_memberships m on m.business_account_id = b.business_account_id
          where b.status = 'active' and (m.business_id is null or m.business_id = b.id)
        ),
        visible_units as (
          select distinct bu.id, bu.business_id, bu.name, bu.unit_type, bu.location, bu.status, bu.updated_at
          from business_units bu join actor_memberships m on m.business_account_id = bu.business_account_id
          where bu.status = 'active'
            and (m.business_id is null or m.business_id = bu.business_id)
            and (m.business_unit_id is null or m.business_unit_id = bu.id)
        ),
        worker_memberships as (
          select distinct m.*
          from memberships m
          join role_permissions rp on rp.role_id = m.role_id
          join permissions p on p.id = rp.permission_id
          where m.user_id = $1 and m.status = 'active' and p.code = 'worker.view'
        ),
        visible_members as (
          select distinct target.id, target.user_id, u.full_name, u.email, u.phone,
            target.role_id, r.code as role_code, r.name as role_name,
            target.business_id, target.business_unit_id, target.status, target.updated_at
          from worker_memberships actor
          join memberships target on target.business_account_id = actor.business_account_id
            and (actor.business_id is null or target.business_id = actor.business_id)
            and (actor.business_unit_id is null or target.business_unit_id = actor.business_unit_id)
          join users u on u.id = target.user_id
          join roles r on r.id = target.role_id
        )
        select 'business' as entity_type, id, updated_at,
          jsonb_build_object(
            'id', id, 'name', name, 'businessType', business_type,
            'country', country, 'currency', currency, 'status', status
          ) as payload
        from visible_businesses
        union all
        select 'business_unit', id, updated_at,
          jsonb_build_object(
            'id', id, 'businessId', business_id, 'name', name,
            'unitType', unit_type, 'location', location, 'status', status
          )
        from visible_units
        union all
        select 'employee', id, updated_at,
          jsonb_build_object(
            'id', id, 'userId', user_id, 'fullName', full_name, 'email', email,
            'phone', phone, 'roleId', role_id, 'roleCode', role_code,
            'roleName', role_name, 'businessId', business_id,
            'businessUnitId', business_unit_id, 'status', status
          )
        from visible_members
        order by entity_type, id
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let authorization_version: i64 = sqlx::query_scalar(
        "select coalesce((extract(epoch from max(updated_at)) * 1000)::bigint, 0) from memberships where user_id = $1",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let scope = sqlx::query(
        r#"
        select
          coalesce(array_agg(distinct b.id) filter (where b.id is not null), array[]::uuid[]) as business_ids,
          coalesce(array_agg(distinct bu.id) filter (where bu.id is not null), array[]::uuid[]) as unit_ids,
          coalesce(array_agg(distinct p.code) filter (where p.code is not null), array[]::text[]) as permissions,
          coalesce(bool_and(r.code = 'cashier'), false) as restrict_to_own_records
        from memberships m
        join roles r on r.id = m.role_id
        left join role_permissions rp on rp.role_id = m.role_id
        left join permissions p on p.id = rp.permission_id
        left join businesses b on b.business_account_id = m.business_account_id
          and (m.business_id is null or m.business_id = b.id)
          and b.status = 'active'
        left join business_units bu on bu.business_account_id = m.business_account_id
          and (m.business_id is null or m.business_id = bu.business_id)
          and (m.business_unit_id is null or m.business_unit_id = bu.id)
          and bu.status = 'active'
        where m.user_id = $1 and m.status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    let scope_rows = sqlx::query(
        r#"
        select
          coalesce(array(
            select b.id from businesses b
            where b.business_account_id = m.business_account_id
              and (m.business_id is null or m.business_id = b.id)
              and b.status = 'active'
          ), array[]::uuid[]) as business_ids,
          coalesce(array(
            select bu.id from business_units bu
            where bu.business_account_id = m.business_account_id
              and (m.business_id is null or m.business_id = bu.business_id)
              and (m.business_unit_id is null or m.business_unit_id = bu.id)
              and bu.status = 'active'
          ), array[]::uuid[]) as unit_ids,
          coalesce(array(
            select p.code from role_permissions rp
            join permissions p on p.id = rp.permission_id
            where rp.role_id = m.role_id
            order by p.code
          ), array[]::text[]) as permissions,
          r.code = 'cashier' as restrict_to_own_records
        from memberships m
        join roles r on r.id = m.role_id
        where m.user_id = $1 and m.status = 'active'
        order by m.created_at
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    let authorization_scopes = scope_rows
        .into_iter()
        .map(|row| {
            Ok(SyncAuthorizationScope {
                business_ids: row.try_get("business_ids")?,
                business_unit_ids: row.try_get("unit_ids")?,
                permissions: row.try_get("permissions")?,
                restrict_to_own_records: row.try_get("restrict_to_own_records")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    let mut changes = Vec::with_capacity(rows.len());
    let mut allowed_entity_keys = Vec::with_capacity(rows.len());
    for row in rows {
        let entity_type: String = row.try_get("entity_type")?;
        let entity_id: Uuid = row.try_get("id")?;
        let changed_at: chrono::DateTime<Utc> = row.try_get("updated_at")?;
        allowed_entity_keys.push(format!("{entity_type}:{entity_id}"));
        changes.push(CloudChange {
            change_id: format!(
                "{entity_type}:{entity_id}:{}",
                changed_at.timestamp_millis()
            ),
            entity_type,
            entity_id,
            version: changed_at.timestamp_millis(),
            deleted: false,
            payload: row.try_get("payload")?,
            changed_at: changed_at.to_rfc3339(),
        });
    }
    Ok(SyncPullResult {
        cursor: Utc::now().to_rfc3339(),
        user_id,
        authorization_version,
        allowed_business_ids: scope.try_get("business_ids")?,
        allowed_business_unit_ids: scope.try_get("unit_ids")?,
        permissions: scope.try_get("permissions")?,
        restrict_to_own_records: scope.try_get("restrict_to_own_records")?,
        authorization_scopes,
        allowed_entity_keys,
        changes,
        sync_run_id: run_id,
    })
}

async fn start_run(
    db: &PgPool,
    user_id: Uuid,
    device_id: Option<Uuid>,
    direction: &str,
    cursor: Option<&str>,
    operation_count: i32,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        insert into sync_runs (user_id, device_id, direction, cursor_received, operation_count, status)
        values ($1, $2, $3, $4, $5, 'started')
        returning id
        "#,
    )
    .bind(user_id)
    .bind(device_id)
    .bind(direction)
    .bind(cursor)
    .bind(operation_count)
    .fetch_one(db)
    .await
}

async fn finish_run(
    db: &PgPool,
    run_id: Uuid,
    status: &str,
    cursor: Option<&str>,
    accepted_count: i32,
    rejected_count: i32,
    error: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        update sync_runs set status = $2, cursor_returned = $3,
          accepted_count = $4, rejected_count = $5, error_message = $6,
          completed_at = now()
        where id = $1
        "#,
    )
    .bind(run_id)
    .bind(status)
    .bind(cursor)
    .bind(accepted_count)
    .bind(rejected_count)
    .bind(error)
    .execute(db)
    .await?;
    Ok(())
}
