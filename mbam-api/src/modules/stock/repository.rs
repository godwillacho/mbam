use sqlx::PgPool;
use uuid::Uuid;

use super::model::{StockMovement, StockMovementWriteRequest};

const STOCK_MOVEMENT_COLUMNS: &str = r#"
  movement.id, movement.product_id, movement.business_id, movement.business_unit_id,
  movement.movement_type,
  movement.quantity_delta::float8 as quantity_delta,
  movement.unit_cost::float8 as unit_cost,
  movement.source_transaction_id, movement.source_receipt_import_id, movement.note,
  movement.created_by, creator.full_name as created_by_name, movement.created_at
"#;

/// The scope this module needs, ahead of taking any lock, purely to resolve
/// a permission check and to 404 on an unknown/disabled product. The
/// authoritative quantity/policy read happens later, inside `create`, under
/// a row lock -- reading it here too would just be a stale value the
/// locked read immediately supersedes.
pub struct ProductScope {
    pub business_id: Uuid,
    pub business_unit_id: Uuid,
}

pub async fn find_product_scope(
    db: &PgPool,
    product_id: Uuid,
) -> Result<Option<ProductScope>, sqlx::Error> {
    let row = sqlx::query_as::<_, (Uuid, Uuid)>(
        r#"
        select business_id, business_unit_id
        from products
        where id = $1 and status = 'active'
        "#,
    )
    .bind(product_id)
    .fetch_optional(db)
    .await?;
    Ok(row.map(|(business_id, business_unit_id)| ProductScope {
        business_id,
        business_unit_id,
    }))
}

/// Applies a stock movement under an explicit, caller-chosen `movement_id`:
/// locks the product row, recomputes its quantity, enforces
/// `block_when_empty`, writes the ledger row, and audits the change -- all
/// in one transaction. Mirrors the same locked-update pattern used for
/// sale-driven deductions in `transactions::repository::create`.
///
/// Callers pass a fresh `Uuid::new_v4()` for a direct API create, or the
/// offline-generated local id (reused as the server id, same trick
/// `sync::service::apply_transaction_operation` uses for transactions) when
/// replaying a queued offline movement. Because the id is caller-chosen
/// rather than generated in here, a retried sync push for the same
/// `movement_id` is idempotent: the existence check below runs *after* the
/// product row lock is acquired (not before opening the transaction), so a
/// truly concurrent retry serializes behind that lock and then sees the
/// first attempt's committed row instead of racing it.
pub async fn create(
    db: &PgPool,
    actor_id: Uuid,
    account_id: Uuid,
    movement_id: Uuid,
    payload: &StockMovementWriteRequest,
) -> Result<StockMovement, crate::error::ApiError> {
    let mut tx = db.begin().await?;

    let (business_id, business_unit_id, available_quantity, stock_policy): (
        Uuid,
        Uuid,
        Option<f64>,
        String,
    ) = sqlx::query_as(
        r#"
        select business_id, business_unit_id,
          available_quantity::float8 as available_quantity, stock_policy
        from products
        where id = $1 and status = 'active'
        for update
        "#,
    )
    .bind(payload.product_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(crate::error::ApiError::NotFound)?;

    let already_applied: bool =
        sqlx::query_scalar("select exists(select 1 from stock_movements where id = $1)")
            .bind(movement_id)
            .fetch_one(&mut *tx)
            .await?;
    if already_applied {
        tx.commit().await?;
        return find_by_id(db, movement_id)
            .await?
            .ok_or(crate::error::ApiError::Internal);
    }

    // Quantity tracking is opt-in per product (see migration 0013's comment).
    // A manual movement against an untracked product is rejected outright
    // rather than silently recording a no-op ledger row with no
    // corresponding quantity change -- unlike the sale-deduction path in
    // transactions::repository::apply_sale_stock_deductions, which *does*
    // silently skip untracked products, because a sale is not the user
    // explicitly asking for an inventory event to be recorded the way a
    // manual movement is.
    let Some(current) = available_quantity else {
        return Err(crate::error::ApiError::BadRequest(
            "this product does not track quantity, so stock movements cannot be recorded for it"
                .to_string(),
        ));
    };
    let new_quantity = current + payload.quantity_delta;
    if stock_policy == "block_when_empty" && new_quantity < 0.0 {
        return Err(crate::error::ApiError::BadRequest(
            "this movement would take stock below zero for a product that blocks when empty"
                .to_string(),
        ));
    }
    sqlx::query("update products set available_quantity = $2, updated_at = now() where id = $1")
        .bind(payload.product_id)
        .bind(new_quantity)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        r#"
        insert into stock_movements (
          id, product_id, business_account_id, business_id, business_unit_id,
          movement_type, quantity_delta, unit_cost, source_receipt_import_id,
          note, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        "#,
    )
    .bind(movement_id)
    .bind(payload.product_id)
    .bind(account_id)
    .bind(business_id)
    .bind(business_unit_id)
    .bind(&payload.movement_type)
    .bind(payload.quantity_delta)
    .bind(payload.unit_cost)
    .bind(payload.source_receipt_import_id)
    .bind(&payload.note)
    .bind(actor_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, business_id, business_unit_id,
          action, resource_type, resource_id
        ) values ($1, $2, $3, $4, 'stock.movement.create', 'stock_movement', $5)
        "#,
    )
    .bind(actor_id)
    .bind(account_id)
    .bind(business_id)
    .bind(business_unit_id)
    .bind(movement_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    find_by_id(db, movement_id)
        .await?
        .ok_or(crate::error::ApiError::Internal)
}

pub async fn find_by_id(
    db: &PgPool,
    movement_id: Uuid,
) -> Result<Option<StockMovement>, sqlx::Error> {
    let query = format!(
        r#"
        select {STOCK_MOVEMENT_COLUMNS}
        from stock_movements movement
        join users creator on creator.id = movement.created_by
        where movement.id = $1
        "#
    );
    sqlx::query_as::<_, StockMovement>(&query)
        .bind(movement_id)
        .fetch_optional(db)
        .await
}

/// Lists ledger rows visible to `user_id`, scoped the same way
/// `products::repository::list_for_user` scopes product visibility, gated on
/// `stock.movement.view` instead of `product.view`. Optional filters narrow
/// to one product and/or one business unit.
pub async fn list_for_user(
    db: &PgPool,
    user_id: Uuid,
    product_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
) -> Result<Vec<StockMovement>, sqlx::Error> {
    let query = format!(
        r#"
        select distinct {STOCK_MOVEMENT_COLUMNS}
        from stock_movements movement
        join users creator on creator.id = movement.created_by
        join memberships membership
          on membership.business_account_id = movement.business_account_id
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission
          on permission.id = role_permission.permission_id
         and permission.code = 'stock.movement.view'
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = movement.business_id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = movement.business_unit_id
        where membership.user_id = $1
          and membership.status = 'active'
          and ($2::uuid is null or movement.product_id = $2)
          and ($3::uuid is null or movement.business_unit_id = $3)
          and (
            membership.business_id is null
            or membership.business_id = movement.business_id
            or business_scope.business_id is not null
          )
          and (
            membership.business_unit_id is null
            or membership.business_unit_id = movement.business_unit_id
            or unit_scope.business_unit_id is not null
          )
        order by movement.created_at desc
        limit 500
        "#
    );
    sqlx::query_as::<_, StockMovement>(&query)
        .bind(user_id)
        .bind(product_id)
        .bind(business_unit_id)
        .fetch_all(db)
        .await
}
