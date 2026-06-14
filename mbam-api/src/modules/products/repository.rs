use sqlx::PgPool;
use uuid::Uuid;

use super::model::{Product, ProductWriteRequest};

const PRODUCT_COLUMNS: &str = r#"
  id, business_account_id, business_id, business_unit_id, name, sku, category,
  manufacturer, brand, variant, package_size, unit_of_measure, barcode,
  available_quantity::float8 as available_quantity,
  low_stock_threshold::float8 as low_stock_threshold,
  expiry_date, cost_price::float8 as cost_price,
  default_price::float8 as default_price, status, created_at, updated_at
"#;

const PRODUCT_SELECT_COLUMNS: &str = r#"
  product.id, product.business_account_id, product.business_id,
  product.business_unit_id, product.name, product.sku, product.category,
  product.manufacturer, product.brand, product.variant, product.package_size,
  product.unit_of_measure, product.barcode,
  product.available_quantity::float8 as available_quantity,
  product.low_stock_threshold::float8 as low_stock_threshold,
  product.expiry_date, product.cost_price::float8 as cost_price,
  product.default_price::float8 as default_price, product.status,
  product.created_at, product.updated_at
"#;

pub async fn list_for_user(db: &PgPool, user_id: Uuid) -> Result<Vec<Product>, sqlx::Error> {
    let query = format!(
        r#"
        select distinct {PRODUCT_SELECT_COLUMNS}
        from products product
        join memberships membership
          on membership.business_account_id = product.business_account_id
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission
          on permission.id = role_permission.permission_id
         and permission.code = 'product.view'
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = product.business_id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = product.business_unit_id
        where membership.user_id = $1
          and membership.status = 'active'
          and product.status = 'active'
          and (
            membership.business_id is null
            or membership.business_id = product.business_id
            or membership.business_unit_id = product.business_unit_id
            or business_scope.business_id is not null
            or unit_scope.business_unit_id is not null
          )
        order by product.name, product.created_at
        "#
    );
    sqlx::query_as::<_, Product>(&query)
        .bind(user_id)
        .fetch_all(db)
        .await
}

pub async fn find_visible(
    db: &PgPool,
    user_id: Uuid,
    product_id: Uuid,
) -> Result<Option<Product>, sqlx::Error> {
    let query = format!(
        r#"
        select {PRODUCT_SELECT_COLUMNS}
        from products product
        join memberships membership
          on membership.business_account_id = product.business_account_id
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission
          on permission.id = role_permission.permission_id
         and permission.code = 'product.view'
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = product.business_id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = product.business_unit_id
        where membership.user_id = $1
          and membership.status = 'active'
          and product.id = $2
          and (
            membership.business_id is null
            or membership.business_id = product.business_id
            or membership.business_unit_id = product.business_unit_id
            or business_scope.business_id is not null
            or unit_scope.business_unit_id is not null
          )
        limit 1
        "#
    );
    sqlx::query_as::<_, Product>(&query)
        .bind(user_id)
        .bind(product_id)
        .fetch_optional(db)
        .await
}

pub async fn permitted_scope(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    business_unit_id: Uuid,
    permission: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select membership.business_account_id
        from memberships membership
        join businesses business
          on business.business_account_id = membership.business_account_id
         and business.id = $2
         and business.status = 'active'
        join business_units unit
          on unit.business_account_id = membership.business_account_id
         and unit.business_id = business.id
         and unit.id = $3
         and unit.status = 'active'
        join role_permissions role_permission on role_permission.role_id = membership.role_id
        join permissions permission on permission.id = role_permission.permission_id
        left join membership_business_scopes business_scope
          on business_scope.membership_id = membership.id
         and business_scope.business_id = business.id
        left join membership_business_unit_scopes unit_scope
          on unit_scope.membership_id = membership.id
         and unit_scope.business_unit_id = unit.id
        where membership.user_id = $1 and membership.status = 'active'
          and permission.code = $4
          and (
            membership.business_id is null
            or membership.business_id = business.id
            or membership.business_unit_id = unit.id
            or business_scope.business_id is not null
            or unit_scope.business_unit_id is not null
          )
        order by membership.created_at
        limit 1
        "#,
    )
    .bind(user_id)
    .bind(business_id)
    .bind(business_unit_id)
    .bind(permission)
    .fetch_optional(db)
    .await
}

pub async fn duplicate_exists(
    db: &PgPool,
    business_unit_id: Uuid,
    product_id: Option<Uuid>,
    sku: Option<&str>,
    barcode: Option<&str>,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1 from products
          where business_unit_id = $1 and status = 'active'
            and ($2::uuid is null or id <> $2)
            and (
              ($3::text is not null and lower(sku) = lower($3))
              or ($4::text is not null and barcode = $4)
            )
        )
        "#,
    )
    .bind(business_unit_id)
    .bind(product_id)
    .bind(sku)
    .bind(barcode)
    .fetch_one(db)
    .await
}

pub async fn create(
    db: &PgPool,
    actor_id: Uuid,
    account_id: Uuid,
    payload: &ProductWriteRequest,
) -> Result<Product, sqlx::Error> {
    let query = format!(
        r#"
        insert into products (
          id, business_account_id, business_id, business_unit_id, name, sku,
          category, manufacturer, brand, variant, package_size, unit_of_measure,
          barcode, available_quantity, low_stock_threshold, expiry_date,
          cost_price, default_price
        )
        values (
          coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18
        )
        returning {PRODUCT_COLUMNS}
        "#
    );
    let mut tx = db.begin().await?;
    let product = sqlx::query_as::<_, Product>(&query)
        .bind(payload.id)
        .bind(account_id)
        .bind(payload.business_id)
        .bind(payload.business_unit_id)
        .bind(&payload.name)
        .bind(&payload.sku)
        .bind(payload.category.as_deref().unwrap_or("other"))
        .bind(&payload.manufacturer)
        .bind(&payload.brand)
        .bind(&payload.variant)
        .bind(&payload.package_size)
        .bind(&payload.unit_of_measure)
        .bind(&payload.barcode)
        .bind(payload.available_quantity)
        .bind(payload.low_stock_threshold)
        .bind(payload.expiry_date)
        .bind(payload.cost_price)
        .bind(payload.default_price.unwrap_or(0.0))
        .fetch_one(&mut *tx)
        .await?;
    audit(&mut tx, actor_id, account_id, &product, "product.create").await?;
    tx.commit().await?;
    Ok(product)
}

pub async fn update(
    db: &PgPool,
    actor_id: Uuid,
    account_id: Uuid,
    product_id: Uuid,
    payload: &ProductWriteRequest,
) -> Result<Option<Product>, sqlx::Error> {
    let query = format!(
        r#"
        update products set
          business_unit_id = $4, name = $5, sku = $6, category = $7,
          manufacturer = $8, brand = $9, variant = $10, package_size = $11,
          unit_of_measure = $12, barcode = $13, available_quantity = $14,
          low_stock_threshold = $15, expiry_date = $16, cost_price = $17,
          default_price = $18, updated_at = now()
        where id = $1 and business_account_id = $2 and business_id = $3
        returning {PRODUCT_COLUMNS}
        "#
    );
    let mut tx = db.begin().await?;
    let product = sqlx::query_as::<_, Product>(&query)
        .bind(product_id)
        .bind(account_id)
        .bind(payload.business_id)
        .bind(payload.business_unit_id)
        .bind(&payload.name)
        .bind(&payload.sku)
        .bind(payload.category.as_deref().unwrap_or("other"))
        .bind(&payload.manufacturer)
        .bind(&payload.brand)
        .bind(&payload.variant)
        .bind(&payload.package_size)
        .bind(&payload.unit_of_measure)
        .bind(&payload.barcode)
        .bind(payload.available_quantity)
        .bind(payload.low_stock_threshold)
        .bind(payload.expiry_date)
        .bind(payload.cost_price)
        .bind(payload.default_price.unwrap_or(0.0))
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(product) = &product {
        audit(&mut tx, actor_id, account_id, product, "product.update").await?;
    }
    tx.commit().await?;
    Ok(product)
}

pub async fn disable(
    db: &PgPool,
    actor_id: Uuid,
    account_id: Uuid,
    product_id: Uuid,
) -> Result<Option<Product>, sqlx::Error> {
    let query = format!(
        r#"
        update products set status = 'disabled', updated_at = now()
        where id = $1 and business_account_id = $2
        returning {PRODUCT_COLUMNS}
        "#
    );
    let mut tx = db.begin().await?;
    let product = sqlx::query_as::<_, Product>(&query)
        .bind(product_id)
        .bind(account_id)
        .fetch_optional(&mut *tx)
        .await?;
    if let Some(product) = &product {
        audit(&mut tx, actor_id, account_id, product, "product.disable").await?;
    }
    tx.commit().await?;
    Ok(product)
}

async fn audit(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor_id: Uuid,
    account_id: Uuid,
    product: &Product,
    action: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, business_id, business_unit_id,
          action, resource_type, resource_id
        )
        values ($1, $2, $3, $4, $5, 'product', $6)
        "#,
    )
    .bind(actor_id)
    .bind(account_id)
    .bind(product.business_id)
    .bind(product.business_unit_id)
    .bind(action)
    .bind(product.id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
