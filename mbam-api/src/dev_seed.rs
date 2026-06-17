use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::security::password;

const ACCOUNT_ID: &str = "10000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID: &str = "10000000-0000-4000-8000-000000000101";
const MANAGER_USER_ID: &str = "10000000-0000-4000-8000-000000000102";
const CASHIER_USER_ID: &str = "10000000-0000-4000-8000-000000000103";
const GROCERY_BUSINESS_ID: &str = "10000000-0000-4000-8000-000000000201";
const ELECTRONICS_BUSINESS_ID: &str = "10000000-0000-4000-8000-000000000202";
const DOUALA_UNIT_ID: &str = "10000000-0000-4000-8000-000000000301";
const YAOUNDE_UNIT_ID: &str = "10000000-0000-4000-8000-000000000302";
const SHOWROOM_UNIT_ID: &str = "10000000-0000-4000-8000-000000000303";
const WAREHOUSE_UNIT_ID: &str = "10000000-0000-4000-8000-000000000304";
const ADMIN_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000401";
const MANAGER_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000402";
const CASHIER_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000403";

pub async fn seed_test_accounts(db: &PgPool) -> Result<(), sqlx::Error> {
    let account_id = uuid(ACCOUNT_ID);
    let admin_user_id = uuid(ADMIN_USER_ID);
    let manager_user_id = uuid(MANAGER_USER_ID);
    let cashier_user_id = uuid(CASHIER_USER_ID);
    let grocery_business_id = uuid(GROCERY_BUSINESS_ID);
    let electronics_business_id = uuid(ELECTRONICS_BUSINESS_ID);
    let douala_unit_id = uuid(DOUALA_UNIT_ID);
    let yaounde_unit_id = uuid(YAOUNDE_UNIT_ID);
    let showroom_unit_id = uuid(SHOWROOM_UNIT_ID);
    let warehouse_unit_id = uuid(WAREHOUSE_UNIT_ID);

    let admin_hash = hash("AdminTest123")?;
    let manager_hash = hash("ManagerTest123")?;
    let cashier_hash = hash("CashierTest123")?;

    let mut tx = db.begin().await?;

    upsert_user(
        &mut tx,
        admin_user_id,
        "Mbam Test Admin",
        "admin.test@mbam.local",
        &admin_hash,
    )
    .await?;
    upsert_user(
        &mut tx,
        manager_user_id,
        "Mbam Test Shop Manager",
        "manager.test@mbam.local",
        &manager_hash,
    )
    .await?;
    upsert_user(
        &mut tx,
        cashier_user_id,
        "Mbam Test Cashier",
        "cashier.test@mbam.local",
        &cashier_hash,
    )
    .await?;

    sqlx::query(
        r#"
        insert into business_accounts (id, name, owner_user_id, status)
        values ($1, 'Mbam Role Test Account', $2, 'active')
        on conflict (id) do update
          set name = excluded.name,
              owner_user_id = excluded.owner_user_id,
              status = 'active',
              updated_at = now()
        "#,
    )
    .bind(account_id)
    .bind(admin_user_id)
    .execute(&mut *tx)
    .await?;

    upsert_business(
        &mut tx,
        account_id,
        grocery_business_id,
        "Mbam Test Grocery",
        "Retail grocery",
        "Cameroon",
        "XAF",
    )
    .await?;
    upsert_business(
        &mut tx,
        account_id,
        electronics_business_id,
        "Mbam Test Electronics",
        "Consumer electronics",
        "Cameroon",
        "XAF",
    )
    .await?;

    upsert_unit(&mut tx, account_id, grocery_business_id, douala_unit_id, "Douala Test Shop", "shop", "Akwa, Douala").await?;
    upsert_unit(&mut tx, account_id, grocery_business_id, yaounde_unit_id, "Yaounde Test Desk", "sales_desk", "Mokolo, Yaounde").await?;
    upsert_unit(&mut tx, account_id, electronics_business_id, showroom_unit_id, "Bonapriso Test Showroom", "shop", "Bonapriso, Douala").await?;
    upsert_unit(&mut tx, account_id, electronics_business_id, warehouse_unit_id, "Bassa Test Warehouse", "warehouse", "Bassa Industrial Zone").await?;

    let business_admin_role_id = upsert_role(
        &mut tx,
        account_id,
        "business_admin",
        "Business Admin",
        "Manage granted businesses, workers, reports, products, and sales.",
        &[
            "business.view",
            "business.update",
            "unit.view",
            "unit.create",
            "unit.update",
            "worker.view",
            "worker.invite",
            "worker.update",
            "worker.disable",
            "role.assign",
            "sale.create",
            "sale.view",
            "sale.refund",
            "product.create",
            "product.update",
            "product.view",
            "report.view",
            "report.profit.view",
            "sync.pull",
            "sync.push",
            "screen.record_transaction",
            "screen.transaction_drafts",
            "screen.transactions",
            "screen.businesses",
            "screen.team",
            "screen.products",
            "screen.reports",
        ],
    )
    .await?;
    let shop_manager_role_id = upsert_role(
        &mut tx,
        account_id,
        "shop_manager",
        "Shop Manager",
        "Manage operations, workers, products, sales, and reports in one unit.",
        &[
            "business.view",
            "unit.view",
            "worker.view",
            "worker.invite",
            "worker.update",
            "worker.disable",
            "role.assign",
            "sale.create",
            "sale.view",
            "sale.refund",
            "product.create",
            "product.update",
            "product.view",
            "report.view",
            "sync.pull",
            "sync.push",
            "screen.record_transaction",
            "screen.transaction_drafts",
            "screen.transactions",
            "screen.businesses",
            "screen.team",
            "screen.products",
            "screen.reports",
        ],
    )
    .await?;
    let cashier_role_id = upsert_role(
        &mut tx,
        account_id,
        "cashier",
        "Cashier",
        "Record sales and view data required for assigned work.",
        &[
            "business.view",
            "unit.view",
            "sale.create",
            "sale.view",
            "product.view",
            "sync.pull",
            "sync.push",
            "screen.record_transaction",
            "screen.transaction_drafts",
            "screen.transactions",
            "screen.products",
        ],
    )
    .await?;

    let admin_membership_id = upsert_membership(
        &mut tx,
        uuid(ADMIN_MEMBERSHIP_ID),
        admin_user_id,
        account_id,
        business_admin_role_id,
        Some(grocery_business_id),
        None,
    )
    .await?;
    let manager_membership_id = upsert_membership(
        &mut tx,
        uuid(MANAGER_MEMBERSHIP_ID),
        manager_user_id,
        account_id,
        shop_manager_role_id,
        Some(grocery_business_id),
        Some(douala_unit_id),
    )
    .await?;
    let cashier_membership_id = upsert_membership(
        &mut tx,
        uuid(CASHIER_MEMBERSHIP_ID),
        cashier_user_id,
        account_id,
        cashier_role_id,
        Some(grocery_business_id),
        Some(yaounde_unit_id),
    )
    .await?;

    grant_business_scope(&mut tx, admin_membership_id, grocery_business_id).await?;
    grant_business_scope(&mut tx, admin_membership_id, electronics_business_id).await?;
    grant_unit_scope(&mut tx, admin_membership_id, douala_unit_id).await?;
    grant_unit_scope(&mut tx, admin_membership_id, yaounde_unit_id).await?;
    grant_unit_scope(&mut tx, admin_membership_id, showroom_unit_id).await?;
    grant_unit_scope(&mut tx, admin_membership_id, warehouse_unit_id).await?;
    grant_unit_scope(&mut tx, manager_membership_id, douala_unit_id).await?;
    grant_unit_scope(&mut tx, cashier_membership_id, yaounde_unit_id).await?;

    upsert_product(
        &mut tx,
        account_id,
        grocery_business_id,
        douala_unit_id,
        uuid("10000000-0000-4000-8000-000000000501"),
        "Test Rice Bag 25kg",
        "TEST-RICE-25",
        "Groceries",
        25_000.0,
    )
    .await?;
    upsert_product(
        &mut tx,
        account_id,
        grocery_business_id,
        yaounde_unit_id,
        uuid("10000000-0000-4000-8000-000000000502"),
        "Test Cooking Oil 5L",
        "TEST-OIL-5L",
        "Groceries",
        6_500.0,
    )
    .await?;
    upsert_product(
        &mut tx,
        account_id,
        electronics_business_id,
        showroom_unit_id,
        uuid("10000000-0000-4000-8000-000000000503"),
        "Test Bluetooth Speaker",
        "TEST-SPK-BT",
        "Electronics",
        45_000.0,
    )
    .await?;

    tx.commit().await
}

fn uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).expect("static development seed UUID must be valid")
}

fn hash(value: &str) -> Result<String, sqlx::Error> {
    password::hash_password(value)
        .map_err(|error| sqlx::Error::Protocol(format!("failed to hash development password: {error}")))
}

async fn upsert_user(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    full_name: &str,
    email: &str,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into users (id, full_name, email, password_hash, email_verified, status)
        values ($1, $2, $3, $4, true, 'active')
        on conflict (email) do update
          set full_name = excluded.full_name,
              password_hash = excluded.password_hash,
              email_verified = true,
              status = 'active',
              updated_at = now()
        "#,
    )
    .bind(user_id)
    .bind(full_name)
    .bind(email)
    .bind(password_hash)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn upsert_business(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    business_id: Uuid,
    name: &str,
    business_type: &str,
    country: &str,
    currency: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into businesses (id, business_account_id, name, business_type, country, currency, status)
        values ($1, $2, $3, $4, $5, $6, 'active')
        on conflict (id) do update
          set name = excluded.name,
              business_type = excluded.business_type,
              country = excluded.country,
              currency = excluded.currency,
              status = 'active',
              updated_at = now()
        "#,
    )
    .bind(business_id)
    .bind(account_id)
    .bind(name)
    .bind(business_type)
    .bind(country)
    .bind(currency)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn upsert_unit(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    business_id: Uuid,
    unit_id: Uuid,
    name: &str,
    unit_type: &str,
    location: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into business_units (id, business_account_id, business_id, name, unit_type, location, status)
        values ($1, $2, $3, $4, $5, $6, 'active')
        on conflict (id) do update
          set name = excluded.name,
              unit_type = excluded.unit_type,
              location = excluded.location,
              status = 'active',
              updated_at = now()
        "#,
    )
    .bind(unit_id)
    .bind(account_id)
    .bind(business_id)
    .bind(name)
    .bind(unit_type)
    .bind(location)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn upsert_role(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    code: &str,
    name: &str,
    description: &str,
    permissions: &[&str],
) -> Result<Uuid, sqlx::Error> {
    let role_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into roles (business_account_id, code, name, description, is_system_role)
        values ($1, $2, $3, $4, true)
        on conflict (business_account_id, code)
        do update set name = excluded.name, description = excluded.description
        returning id
        "#,
    )
    .bind(account_id)
    .bind(code)
    .bind(name)
    .bind(description)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query("delete from role_permissions where role_id = $1")
        .bind(role_id)
        .execute(&mut **tx)
        .await?;
    sqlx::query(
        r#"
        insert into role_permissions (role_id, permission_id)
        select $1, id from permissions where code = any($2)
        on conflict do nothing
        "#,
    )
    .bind(role_id)
    .bind(permissions)
    .execute(&mut **tx)
    .await?;

    Ok(role_id)
}

async fn upsert_membership(
    tx: &mut Transaction<'_, Postgres>,
    membership_id: Uuid,
    user_id: Uuid,
    account_id: Uuid,
    role_id: Uuid,
    business_id: Option<Uuid>,
    unit_id: Option<Uuid>,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into memberships (id, user_id, business_account_id, business_id, business_unit_id, role_id, status)
        values ($1, $2, $3, $4, $5, $6, 'active')
        on conflict (id) do update
          set user_id = excluded.user_id,
              business_account_id = excluded.business_account_id,
              business_id = excluded.business_id,
              business_unit_id = excluded.business_unit_id,
              role_id = excluded.role_id,
              status = 'active',
              updated_at = now()
        returning id
        "#,
    )
    .bind(membership_id)
    .bind(user_id)
    .bind(account_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(role_id)
    .fetch_one(&mut **tx)
    .await
}

async fn grant_business_scope(
    tx: &mut Transaction<'_, Postgres>,
    membership_id: Uuid,
    business_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "insert into membership_business_scopes (membership_id, business_id) values ($1, $2) on conflict do nothing",
    )
    .bind(membership_id)
    .bind(business_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn grant_unit_scope(
    tx: &mut Transaction<'_, Postgres>,
    membership_id: Uuid,
    unit_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "insert into membership_business_unit_scopes (membership_id, business_unit_id) values ($1, $2) on conflict do nothing",
    )
    .bind(membership_id)
    .bind(unit_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn upsert_product(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    business_id: Uuid,
    unit_id: Uuid,
    product_id: Uuid,
    name: &str,
    sku: &str,
    category: &str,
    default_price: f64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into products (
          id, business_account_id, business_id, business_unit_id, name, sku,
          category, available_quantity, low_stock_threshold, default_price, status
        )
        values ($1, $2, $3, $4, $5, $6, $7, 50, 5, $8, 'active')
        on conflict (id) do update
          set business_id = excluded.business_id,
              business_unit_id = excluded.business_unit_id,
              name = excluded.name,
              sku = excluded.sku,
              category = excluded.category,
              default_price = excluded.default_price,
              status = 'active',
              updated_at = now()
        "#,
    )
    .bind(product_id)
    .bind(account_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(name)
    .bind(sku)
    .bind(category)
    .bind(default_price)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
