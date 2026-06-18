use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::modules::products::{model::ProductWriteRequest, repository as product_repository};
use crate::modules::transactions::model::{CreateTransactionLineRequest, CreateTransactionRequest};
use crate::{
    authentication::{AuthorizationContext, BaselineRole},
    error::ApiError,
};

use super::model::{
    CloudChange, SyncAuthorizationScope, SyncPullResult, SyncPushRequest, SyncPushResult,
};

pub async fn pull(
    db: &PgPool,
    authorization: &AuthorizationContext,
    cursor: Option<&str>,
    device_id: Option<Uuid>,
) -> Result<SyncPullResult, ApiError> {
    authorization.require_permission("sync.pull")?;
    let user_id = authorization.user_id;
    let run_id = start_run(db, user_id, device_id, "pull", cursor, 0).await?;
    let result = build_snapshot(db, authorization, run_id).await;
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
    authorization: &AuthorizationContext,
    payload: SyncPushRequest,
) -> Result<Vec<SyncPushResult>, ApiError> {
    authorization.require_permission("sync.push")?;
    let user_id = authorization.user_id;
    let run_id = start_run(
        db,
        user_id,
        payload.device_id,
        "push",
        None,
        payload.operations.len() as i32,
    )
    .await?;
    let mut results = Vec::with_capacity(payload.operations.len());
    for operation in payload.operations {
        results.push(match authorize_operation(authorization, &operation) {
            Ok(()) => apply_operation(db, user_id, operation).await,
            Err(error) => rejected_result(
                operation
                    .get("operationId")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
                error,
            ),
        });
    }
    let accepted_count = results
        .iter()
        .filter(|result| result.outcome == "accepted")
        .count() as i32;
    let rejected_count = results.len() as i32 - accepted_count;
    finish_run(
        db,
        run_id,
        "completed",
        None,
        accepted_count,
        rejected_count,
        None,
    )
    .await?;
    Ok(results)
}

fn authorize_operation(
    authorization: &AuthorizationContext,
    operation: &Value,
) -> Result<(), &'static str> {
    let business_id = operation
        .get("businessId")
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or("sync operation business scope is missing")?;
    let business_unit_id = operation
        .get("businessUnitId")
        .and_then(Value::as_str)
        .and_then(|value| Uuid::parse_str(value).ok());
    let allowed = match business_unit_id {
        Some(unit_id) => authorization
            .require_business_unit_pair("sync.push", business_id, unit_id)
            .is_ok(),
        None => authorization
            .require_business("sync.push", business_id)
            .is_ok(),
    };
    if allowed {
        Ok(())
    } else {
        Err("sync operation is outside current authorization")
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductSyncOperation {
    operation_id: String,
    entity_type: String,
    entity_id: String,
    action: String,
    business_id: Uuid,
    business_unit_id: Option<Uuid>,
    base_version: Option<i64>,
    payload: Value,
}

async fn apply_operation(db: &PgPool, user_id: Uuid, value: Value) -> SyncPushResult {
    let operation = match serde_json::from_value::<ProductSyncOperation>(value) {
        Ok(operation) => operation,
        Err(_) => return rejected_result("unknown", "sync operation is malformed"),
    };
    if operation.entity_type != "product" {
        if operation.entity_type == "transaction" {
            return apply_transaction_operation(db, user_id, operation).await;
        }
        return rejected_result(
            &operation.operation_id,
            "this entity type does not yet have a server sync handler",
        );
    }
    let product_id = match Uuid::parse_str(&operation.entity_id) {
        Ok(product_id) => product_id,
        Err(_) => return rejected_result(&operation.operation_id, "product id is malformed"),
    };
    let mut product = match serde_json::from_value::<ProductWriteRequest>(operation.payload) {
        Ok(product) => product,
        Err(_) => return rejected_result(&operation.operation_id, "product payload is malformed"),
    };
    if product.business_id != operation.business_id
        || Some(product.business_unit_id) != operation.business_unit_id
    {
        return rejected_result(
            &operation.operation_id,
            "product payload scope does not match the authorized sync envelope",
        );
    }
    product.id = Some(product_id);

    let result = match operation.action.as_str() {
        "create" => crate::modules::products::service::create(db, user_id, product).await,
        "update" => match product_repository::find_visible(db, user_id, product_id).await {
            Ok(Some(cloud))
                if operation
                    .base_version
                    .is_some_and(|version| version != cloud.updated_at.timestamp_millis()) =>
            {
                return SyncPushResult {
                    operation_id: operation.operation_id,
                    outcome: "conflict".to_string(),
                    server_id: Some(cloud.id),
                    server_version: Some(cloud.updated_at.timestamp_millis()),
                    error: Some("the cloud product changed after the offline edit".to_string()),
                    cloud_value: serde_json::to_value(cloud).ok(),
                };
            }
            Ok(_) => {
                crate::modules::products::service::update(db, user_id, product_id, product).await
            }
            Err(error) => Err(ApiError::Database(error)),
        },
        "delete" => crate::modules::products::service::disable(db, user_id, product_id).await,
        _ => return rejected_result(&operation.operation_id, "product action is not supported"),
    };

    match result {
        Ok(product) => SyncPushResult {
            operation_id: operation.operation_id,
            outcome: "accepted".to_string(),
            server_id: Some(product.id),
            server_version: Some(product.updated_at.timestamp_millis()),
            error: None,
            cloud_value: None,
        },
        Err(error) => rejected_result(&operation.operation_id, &error.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineTransactionPayload {
    transaction: OfflineTransactionRecord,
    lines: Vec<OfflineTransactionLine>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineTransactionRecord {
    business_id: Uuid,
    business_unit_id: Option<Uuid>,
    customer_name: String,
    customer_contact: Option<String>,
    payment_method: String,
    payment_status: String,
    outstanding_amount: Option<f64>,
    idempotency_key: String,
    created_at: chrono::DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineTransactionLine {
    product_id: Option<Uuid>,
    product_name_snapshot: String,
    sku_snapshot: Option<String>,
    quantity: f64,
    unit_price: f64,
}

async fn apply_transaction_operation(
    db: &PgPool,
    user_id: Uuid,
    operation: ProductSyncOperation,
) -> SyncPushResult {
    if operation.action != "create" {
        return rejected_result(
            &operation.operation_id,
            "offline transaction updates are not supported",
        );
    }
    let payload = match serde_json::from_value::<OfflineTransactionPayload>(operation.payload) {
        Ok(payload) => payload,
        Err(_) => {
            return rejected_result(&operation.operation_id, "transaction payload is malformed")
        }
    };
    if payload.transaction.business_id != operation.business_id
        || payload.transaction.business_unit_id != operation.business_unit_id
    {
        return rejected_result(
            &operation.operation_id,
            "transaction payload scope does not match the authorized sync envelope",
        );
    }
    let request = CreateTransactionRequest {
        id: Uuid::parse_str(&operation.entity_id).ok(),
        business_id: payload.transaction.business_id,
        business_unit_id: payload.transaction.business_unit_id,
        customer_name: payload.transaction.customer_name,
        customer_contact: payload.transaction.customer_contact,
        payment_method: payload.transaction.payment_method,
        payment_status: Some(payload.transaction.payment_status),
        outstanding_amount: payload.transaction.outstanding_amount,
        idempotency_key: payload.transaction.idempotency_key,
        created_at: Some(payload.transaction.created_at),
        lines: payload
            .lines
            .into_iter()
            .map(|line| CreateTransactionLineRequest {
                product_id: line.product_id,
                product_name: line.product_name_snapshot,
                sku: line.sku_snapshot,
                quantity: line.quantity,
                unit_price: line.unit_price,
            })
            .collect(),
    };
    match crate::modules::transactions::service::create(db, user_id, request).await {
        Ok(transaction) => SyncPushResult {
            operation_id: operation.operation_id,
            outcome: "accepted".to_string(),
            server_id: Some(transaction.transaction.id),
            server_version: Some(transaction.transaction.updated_at.timestamp_millis()),
            error: None,
            cloud_value: None,
        },
        Err(error) => rejected_result(&operation.operation_id, &error.to_string()),
    }
}

fn rejected_result(operation_id: &str, error: &str) -> SyncPushResult {
    SyncPushResult {
        operation_id: operation_id.to_string(),
        outcome: "rejected".to_string(),
        server_id: None,
        server_version: None,
        error: Some(error.to_string()),
        cloud_value: None,
    }
}

async fn build_snapshot(
    db: &PgPool,
    authorization: &AuthorizationContext,
    run_id: Uuid,
) -> Result<SyncPullResult, ApiError> {
    let user_id = authorization.user_id;
    let business_ids = authorization
        .business_ids_for_permission("sync.pull")
        .into_iter()
        .collect::<Vec<_>>();
    let unit_ids = authorization
        .business_unit_ids_for_permission("sync.pull")
        .into_iter()
        .collect::<Vec<_>>();
    let can_view_products = authorization.require_permission("product.view").is_ok();
    let can_view_transactions = authorization.require_permission("sale.view").is_ok();
    let can_view_workers = authorization.require_permission("worker.view").is_ok();
    let baseline_role = authorization.baseline_role.code();

    let rows = sqlx::query(
        r#"
        with visible_businesses as (
          select distinct b.id, b.name, b.business_type, b.country, b.currency, b.status, b.updated_at
          from businesses b
          where b.status = 'active' and b.id = any($2)
        ),
        visible_units as (
          select distinct bu.id, bu.business_id, bu.name, bu.unit_type, bu.location, bu.status, bu.updated_at
          from business_units bu
          where bu.status = 'active' and bu.id = any($3)
        ),
        visible_products as (
          select distinct product.*
          from products product
          where $4 and product.status = 'active'
            and product.business_id = any($2)
            and product.business_unit_id = any($3)
        ),
        visible_transactions as (
          select distinct transaction.*, recorder.full_name as recorded_by
          from transactions transaction
          join users recorder on recorder.id = transaction.recorded_by_user_id
          where $5
            and transaction.business_id = any($2)
            and (
              transaction.business_unit_id is null
              or transaction.business_unit_id = any($3)
            )
            and ($7 <> 'cashier' or transaction.recorded_by_user_id = $1)
        ),
        visible_members as (
          select distinct target.id, target.user_id, u.full_name, u.email, u.phone,
            target.role_id, r.code as role_code, r.name as role_name,
            target.business_id, target.business_unit_id, target.status, target.updated_at
          from memberships target
          join users u on u.id = target.user_id
          join roles r on r.id = target.role_id
          where $6 and target.status in ('active', 'disabled')
            and (
              ($7 = 'master_owner' and target.business_account_id = any($8))
              or ($7 = 'business_admin' and target.business_id = any($2))
              or (
                $7 = 'shop_manager'
                and target.business_unit_id = any($3)
                and (r.code = 'cashier' or r.code like 'custom_member_cashier_%')
              )
            )
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
        select 'product', id, updated_at,
          jsonb_build_object(
            'id', id, 'businessId', business_id, 'name', name, 'sku', sku,
            'category', category, 'manufacturer', manufacturer, 'brand', brand,
            'variant', variant, 'packageSize', package_size,
            'unitOfMeasure', unit_of_measure, 'barcode', barcode,
            'availableQuantity', available_quantity,
            'lowStockThreshold', low_stock_threshold, 'expiryDate', expiry_date,
            'costPrice', cost_price, 'defaultPrice', default_price,
            'status', status, 'createdAt', created_at, 'updatedAt', updated_at
          )
        from visible_products
        union all
        select 'transaction', id, updated_at,
          jsonb_build_object(
            'transaction', jsonb_build_object(
              'localId', id::text, 'serverId', id, 'reference', upper(substr(id::text, 1, 8)),
              'businessId', business_id, 'businessUnitId', business_unit_id,
              'customerName', customer_name, 'customerContact', customer_contact,
              'itemCount', (
                select coalesce(sum(line.quantity), 0)
                from transaction_lines line where line.transaction_id = visible_transactions.id
              ),
              'amount', total_amount, 'outstandingAmount', outstanding_amount,
              'paymentMethod', payment_method, 'paymentStatus', payment_status,
              'status', status, 'createdAt', created_at, 'updatedAt', updated_at,
              'recordedBy', recorded_by, 'recordedByUserId', recorded_by_user_id,
              'syncStatus', 'synced', 'idempotencyKey', idempotency_key
            ),
            'lines', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'localLineId', line.id::text,
                'transactionLocalId', line.transaction_id::text,
                'productId', line.product_id,
                'productNameSnapshot', line.product_name_snapshot,
                'skuSnapshot', line.sku_snapshot, 'quantity', line.quantity,
                'unitPrice', line.unit_price, 'lineTotal', line.line_total,
                'createdAt', line.created_at
              ) order by line.created_at, line.id), '[]'::jsonb)
              from transaction_lines line where line.transaction_id = visible_transactions.id
            )
          )
        from visible_transactions
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
    .bind(&business_ids)
    .bind(&unit_ids)
    .bind(can_view_products)
    .bind(can_view_transactions)
    .bind(can_view_workers)
    .bind(baseline_role)
    .bind(
        authorization
            .authorized_business_account_ids
            .iter()
            .copied()
            .collect::<Vec<_>>(),
    )
    .fetch_all(db)
    .await?;
    let authorization_scopes = authorization
        .scopes_for_permission("sync.pull")
        .into_iter()
        .map(|scope| SyncAuthorizationScope {
            business_ids: scope.business_ids.into_iter().collect(),
            business_unit_ids: scope.business_unit_ids.into_iter().collect(),
            permissions: scope.permissions.into_iter().collect(),
            restrict_to_own_records: scope.restrict_to_own_records,
        })
        .collect::<Vec<_>>();
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
        authorization_version: authorization.authorization_version,
        allowed_business_ids: business_ids,
        allowed_business_unit_ids: unit_ids,
        permissions: authorization.permissions.iter().cloned().collect(),
        restrict_to_own_records: authorization.baseline_role == BaselineRole::Cashier,
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
