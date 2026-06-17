use chrono::{DateTime, Utc};
use sqlx::{types::Json, PgPool};
use uuid::Uuid;

use super::model::{
    CreateTransactionRequest, TransactionDraftPayload, TransactionDraftResponse, TransactionLine,
    TransactionRecord, TransactionResponse,
};

const TRANSACTION_COLUMNS: &str = r#"
  transaction.id, transaction.business_id, transaction.business_unit_id,
  transaction.customer_name, transaction.customer_contact,
  transaction.payment_method, transaction.payment_status, transaction.status,
  transaction.outstanding_amount::float8 as outstanding_amount,
  transaction.total_amount::float8 as total_amount,
  transaction.recorded_by_user_id, user_record.full_name as recorded_by,
  transaction.idempotency_key, transaction.created_at, transaction.updated_at
"#;

pub async fn permitted_account_id(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    unit_id: Option<Uuid>,
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
        left join business_units unit
          on unit.id = $3
         and unit.business_id = business.id
         and unit.status = 'active'
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions granted on granted.id = role_permission.permission_id
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = business.id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = unit.id
        where membership.user_id = $1 and membership.status = 'active'
          and granted.code = $4
          and (
            membership.business_id is null
            or membership.business_id = business.id
            or business_scope.business_id is not null
          )
          and (
            $3::uuid is null
            or membership.business_unit_id is null
            or membership.business_unit_id = $3
            or unit_scope.business_unit_id is not null
          )
          and ($3::uuid is null or unit.id is not null)
        limit 1
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(permission)
    .fetch_optional(db)
    .await
}

pub async fn user_account_id(db: &PgPool, user_id: Uuid) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        "select business_account_id from memberships where user_id = $1 and status = 'active' limit 1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
}

pub async fn create_draft(
    db: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    payload: &TransactionDraftPayload,
) -> Result<TransactionDraftResponse, sqlx::Error> {
    let (id, payload, created_at, updated_at) = sqlx::query_as::<
        _,
        (
            Uuid,
            Json<TransactionDraftPayload>,
            DateTime<Utc>,
            DateTime<Utc>,
        ),
    >(
        r#"
            insert into transaction_drafts (business_account_id, recorded_by_user_id, payload)
            values ($1, $2, $3)
            returning id, payload, created_at, updated_at
            "#,
    )
    .bind(account_id)
    .bind(user_id)
    .bind(Json(payload.clone()))
    .fetch_one(db)
    .await?;
    Ok(TransactionDraftResponse {
        id,
        payload: payload.0,
        created_at,
        updated_at,
    })
}

pub async fn list_drafts(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<TransactionDraftResponse>, sqlx::Error> {
    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            Json<TransactionDraftPayload>,
            DateTime<Utc>,
            DateTime<Utc>,
        ),
    >(
        r#"
            select id, payload, created_at, updated_at
            from transaction_drafts
            where recorded_by_user_id = $1
            order by updated_at desc
            "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(id, payload, created_at, updated_at)| TransactionDraftResponse {
                id,
                payload: payload.0,
                created_at,
                updated_at,
            },
        )
        .collect())
}

pub async fn find_draft(
    db: &PgPool,
    user_id: Uuid,
    draft_id: Uuid,
) -> Result<Option<TransactionDraftResponse>, sqlx::Error> {
    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            Json<TransactionDraftPayload>,
            DateTime<Utc>,
            DateTime<Utc>,
        ),
    >(
        r#"
            select id, payload, created_at, updated_at
            from transaction_drafts
            where id = $1 and recorded_by_user_id = $2
            "#,
    )
    .bind(draft_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    Ok(row.map(
        |(id, payload, created_at, updated_at)| TransactionDraftResponse {
            id,
            payload: payload.0,
            created_at,
            updated_at,
        },
    ))
}

pub async fn update_draft(
    db: &PgPool,
    user_id: Uuid,
    draft_id: Uuid,
    account_id: Uuid,
    payload: &TransactionDraftPayload,
) -> Result<Option<TransactionDraftResponse>, sqlx::Error> {
    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            Json<TransactionDraftPayload>,
            DateTime<Utc>,
            DateTime<Utc>,
        ),
    >(
        r#"
            update transaction_drafts
            set business_account_id = $3, payload = $4, updated_at = now()
            where id = $1 and recorded_by_user_id = $2
            returning id, payload, created_at, updated_at
            "#,
    )
    .bind(draft_id)
    .bind(user_id)
    .bind(account_id)
    .bind(Json(payload.clone()))
    .fetch_optional(db)
    .await?;
    Ok(row.map(
        |(id, payload, created_at, updated_at)| TransactionDraftResponse {
            id,
            payload: payload.0,
            created_at,
            updated_at,
        },
    ))
}

pub async fn delete_draft(db: &PgPool, user_id: Uuid, draft_id: Uuid) -> Result<bool, sqlx::Error> {
    Ok(
        sqlx::query("delete from transaction_drafts where id = $1 and recorded_by_user_id = $2")
            .bind(draft_id)
            .bind(user_id)
            .execute(db)
            .await?
            .rows_affected()
            > 0,
    )
}

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    payload: &CreateTransactionRequest,
    total: f64,
) -> Result<TransactionResponse, sqlx::Error> {
    let mut tx = db.begin().await?;
    let transaction_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into transactions (
          id, business_account_id, business_id, business_unit_id,
          customer_name, customer_contact, payment_method, payment_status,
          status, outstanding_amount, total_amount, recorded_by_user_id,
          idempotency_key, created_at
        ) values (
          coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
          'completed', $9, $10, $11, $12, coalesce($13, now())
        )
        on conflict (idempotency_key) do update
          set idempotency_key = excluded.idempotency_key
        returning id
        "#,
    )
    .bind(payload.id)
    .bind(account_id)
    .bind(payload.business_id)
    .bind(payload.business_unit_id)
    .bind(&payload.customer_name)
    .bind(&payload.customer_contact)
    .bind(&payload.payment_method)
    .bind(payload.payment_status.as_deref().unwrap_or("paid"))
    .bind(payload.outstanding_amount.unwrap_or(0.0))
    .bind(total)
    .bind(user_id)
    .bind(&payload.idempotency_key)
    .bind(payload.created_at)
    .fetch_one(&mut *tx)
    .await?;

    let existing_lines: bool = sqlx::query_scalar(
        "select exists(select 1 from transaction_lines where transaction_id = $1)",
    )
    .bind(transaction_id)
    .fetch_one(&mut *tx)
    .await?;
    if !existing_lines {
        for line in &payload.lines {
            sqlx::query(
                r#"
                insert into transaction_lines (
                  transaction_id, product_id, product_name_snapshot, sku_snapshot,
                  quantity, unit_price, line_total
                ) values ($1, $2, $3, $4, $5, $6, $7)
                "#,
            )
            .bind(transaction_id)
            .bind(line.product_id)
            .bind(&line.product_name)
            .bind(&line.sku)
            .bind(line.quantity)
            .bind(line.unit_price)
            .bind(line.quantity * line.unit_price)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query(
            r#"
            insert into audit_logs (
              actor_user_id, business_account_id, business_id, business_unit_id,
              action, resource_type, resource_id
            ) values ($1, $2, $3, $4, 'sale.create', 'transaction', $5)
            "#,
        )
        .bind(user_id)
        .bind(account_id)
        .bind(payload.business_id)
        .bind(payload.business_unit_id)
        .bind(transaction_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    find_by_id(db, user_id, transaction_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_for_user(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<TransactionResponse>, sqlx::Error> {
    let query = format!(
        r#"
        select distinct {TRANSACTION_COLUMNS}
        from transactions transaction
        join users user_record on user_record.id = transaction.recorded_by_user_id
        join memberships membership
          on membership.business_account_id = transaction.business_account_id
        join roles role on role.id = membership.role_id
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions granted
          on granted.id = role_permission.permission_id and granted.code = 'sale.view'
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = transaction.business_id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = transaction.business_unit_id
        where membership.user_id = $1 and membership.status = 'active'
          and (
            membership.business_id is null
            or membership.business_id = transaction.business_id
            or business_scope.business_id is not null
          )
          and (
            membership.business_unit_id is null
            or membership.business_unit_id = transaction.business_unit_id
            or unit_scope.business_unit_id is not null
          )
          and (role.code <> 'cashier' or transaction.recorded_by_user_id = $1)
        order by transaction.created_at desc
        "#
    );
    let records = sqlx::query_as::<_, TransactionRecord>(&query)
        .bind(user_id)
        .fetch_all(db)
        .await?;
    hydrate(db, records).await
}

pub async fn find_by_id(
    db: &PgPool,
    user_id: Uuid,
    transaction_id: Uuid,
) -> Result<Option<TransactionResponse>, sqlx::Error> {
    let query = format!(
        r#"
        select distinct {TRANSACTION_COLUMNS}
        from transactions transaction
        join users user_record on user_record.id = transaction.recorded_by_user_id
        join memberships membership
          on membership.business_account_id = transaction.business_account_id
        join roles role on role.id = membership.role_id
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions granted
          on granted.id = role_permission.permission_id and granted.code = 'sale.view'
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = transaction.business_id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = transaction.business_unit_id
        where membership.user_id = $1 and membership.status = 'active'
          and transaction.id = $2
          and (
            membership.business_id is null
            or membership.business_id = transaction.business_id
            or business_scope.business_id is not null
          )
          and (
            membership.business_unit_id is null
            or membership.business_unit_id = transaction.business_unit_id
            or unit_scope.business_unit_id is not null
          )
          and (role.code <> 'cashier' or transaction.recorded_by_user_id = $1)
        limit 1
        "#
    );
    let record = sqlx::query_as::<_, TransactionRecord>(&query)
        .bind(user_id)
        .bind(transaction_id)
        .fetch_optional(db)
        .await?;
    let Some(record) = record else {
        return Ok(None);
    };
    Ok(hydrate(db, vec![record]).await?.pop())
}

async fn hydrate(
    db: &PgPool,
    records: Vec<TransactionRecord>,
) -> Result<Vec<TransactionResponse>, sqlx::Error> {
    let mut responses = Vec::with_capacity(records.len());
    for record in records {
        let lines = sqlx::query_as::<_, TransactionLine>(
            r#"
            select id, transaction_id, product_id, product_name_snapshot,
              sku_snapshot, quantity::float8 as quantity,
              unit_price::float8 as unit_price, line_total::float8 as line_total,
              created_at
            from transaction_lines where transaction_id = $1 order by created_at, id
            "#,
        )
        .bind(record.id)
        .fetch_all(db)
        .await?;
        responses.push(TransactionResponse {
            transaction: record,
            lines,
        });
    }
    Ok(responses)
}
