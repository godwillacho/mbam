use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::security::password;

const ACCOUNT_ID: &str = "10000000-0000-4000-8000-000000000001";
const MASTER_USER_ID: &str = "10000000-0000-4000-8000-000000000100";
const ADMIN_USER_ID: &str = "10000000-0000-4000-8000-000000000101";
const MANAGER_ONE_USER_ID: &str = "10000000-0000-4000-8000-000000000102";
const CASHIER_ONE_USER_ID: &str = "10000000-0000-4000-8000-000000000103";
const MANAGER_TWO_USER_ID: &str = "10000000-0000-4000-8000-000000000104";
const CASHIER_TWO_USER_ID: &str = "10000000-0000-4000-8000-000000000105";
const BUSINESS_ID: &str = "10000000-0000-4000-8000-000000000201";
const UNIT_ONE_ID: &str = "10000000-0000-4000-8000-000000000301";
const UNIT_TWO_ID: &str = "10000000-0000-4000-8000-000000000302";
const MASTER_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000400";
const ADMIN_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000401";
const MANAGER_ONE_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000402";
const CASHIER_ONE_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000403";
const MANAGER_TWO_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000404";
const CASHIER_TWO_MEMBERSHIP_ID: &str = "10000000-0000-4000-8000-000000000405";

const MASTER_PERMISSIONS: &[&str] = &[
    "business.create", "business.view", "business.update", "business.disable",
    "unit.create", "unit.view", "unit.update", "unit.disable",
    "worker.invite", "worker.view", "worker.update", "worker.disable",
    "role.create", "role.view", "role.update", "role.assign",
    "sale.create", "sale.view", "sale.refund",
    "product.create", "product.update", "product.view",
    "report.view", "report.profit.view", "sync.pull", "sync.push",
    "screen.record_transaction", "screen.transaction_drafts", "screen.transactions",
    "screen.businesses", "screen.team", "screen.products", "screen.reports",
];

const BUSINESS_ADMIN_PERMISSIONS: &[&str] = &[
    "business.view", "business.update", "unit.view", "unit.create", "unit.update",
    "worker.view", "worker.invite", "worker.update", "worker.disable", "role.assign",
    "sale.create", "sale.view", "sale.refund",
    "product.create", "product.update", "product.view",
    "report.view", "report.profit.view", "sync.pull", "sync.push",
    "screen.record_transaction", "screen.transaction_drafts", "screen.transactions",
    "screen.businesses", "screen.team", "screen.products", "screen.reports",
];

const SHOP_MANAGER_PERMISSIONS: &[&str] = &[
    "business.view", "unit.view", "worker.view", "worker.invite", "worker.update",
    "worker.disable", "role.assign", "sale.create", "sale.view", "sale.refund",
    "product.create", "product.update", "product.view", "report.view",
    "sync.pull", "sync.push", "screen.record_transaction", "screen.transaction_drafts",
    "screen.transactions", "screen.businesses", "screen.team", "screen.products",
    "screen.reports",
];

const CASHIER_PERMISSIONS: &[&str] = &[
    "business.view", "unit.view", "sale.create", "sale.view",
    "product.create", "product.update", "product.view",
    "sync.pull", "sync.push", "screen.record_transaction", "screen.transaction_drafts",
    "screen.transactions", "screen.products",
];

pub async fn seed_test_accounts(db: &PgPool) -> Result<(), sqlx::Error> {
    let account_id = uuid(ACCOUNT_ID);
    let business_id = uuid(BUSINESS_ID);
    let unit_one_id = uuid(UNIT_ONE_ID);
    let unit_two_id = uuid(UNIT_TWO_ID);
    let mut tx = db.begin().await?;

    let master_user_id = upsert_user(&mut tx, uuid(MASTER_USER_ID), "Mbam Test Master Owner", "master.test@mbam.local", &hash("MasterTest123")?).await?;
    let admin_user_id = upsert_user(&mut tx, uuid(ADMIN_USER_ID), "Mbam Test Business Admin", "admin.test@mbam.local", &hash("AdminTest123")?).await?;
    let manager_one_user_id = upsert_user(&mut tx, uuid(MANAGER_ONE_USER_ID), "Mbam Test Shop Manager One", "manager.test@mbam.local", &hash("ManagerTest123")?).await?;
    let cashier_one_user_id = upsert_user(&mut tx, uuid(CASHIER_ONE_USER_ID), "Mbam Test Cashier One", "cashier.test@mbam.local", &hash("CashierTest123")?).await?;
    let manager_two_user_id = upsert_user(&mut tx, uuid(MANAGER_TWO_USER_ID), "Mbam Test Shop Manager Two", "manager.two.test@mbam.local", &hash("ManagerTest123")?).await?;
    let cashier_two_user_id = upsert_user(&mut tx, uuid(CASHIER_TWO_USER_ID), "Mbam Test Cashier Two", "cashier.two.test@mbam.local", &hash("CashierTest123")?).await?;

    let test_user_ids = [master_user_id, admin_user_id, manager_one_user_id, cashier_one_user_id, manager_two_user_id, cashier_two_user_id];

    sqlx::query(r#"
        insert into business_accounts (id, name, owner_user_id, status)
        values ($1, 'Mbam Dashboard Test Account', $2, 'active')
        on conflict (id) do update
          set name = excluded.name, owner_user_id = excluded.owner_user_id,
              status = 'active', updated_at = now()
    "#).bind(account_id).bind(master_user_id).execute(&mut *tx).await?;

    upsert_business(&mut tx, account_id, business_id, "Mbam Dashboard Test Business", "Retail", "Cameroon", "XAF").await?;
    upsert_unit(&mut tx, account_id, business_id, unit_one_id, "Dashboard Test Shop One", "shop", "Akwa, Douala").await?;
    upsert_unit(&mut tx, account_id, business_id, unit_two_id, "Dashboard Test Shop Two", "shop", "Mokolo, Yaounde").await?;

    let master_role_id = upsert_role(&mut tx, account_id, "master_owner", "Master Owner", "Full access to the development test account.", MASTER_PERMISSIONS).await?;
    let admin_role_id = upsert_role(&mut tx, account_id, "business_admin", "Business Admin", "Manage the test business and both test shops.", BUSINESS_ADMIN_PERMISSIONS).await?;
    let manager_role_id = upsert_role(&mut tx, account_id, "shop_manager", "Shop Manager", "Manage one assigned test shop.", SHOP_MANAGER_PERMISSIONS).await?;
    let cashier_role_id = upsert_role(&mut tx, account_id, "cashier", "Cashier", "Record sales and manage products in one assigned test shop.", CASHIER_PERMISSIONS).await?;

    let membership_ids = [uuid(MASTER_MEMBERSHIP_ID), uuid(ADMIN_MEMBERSHIP_ID), uuid(MANAGER_ONE_MEMBERSHIP_ID), uuid(CASHIER_ONE_MEMBERSHIP_ID), uuid(MANAGER_TWO_MEMBERSHIP_ID), uuid(CASHIER_TWO_MEMBERSHIP_ID)];
    remove_stale_test_access(&mut tx, account_id, &test_user_ids, &membership_ids).await?;

    let master_membership_id = upsert_membership(&mut tx, membership_ids[0], master_user_id, account_id, master_role_id, None, None).await?;
    let admin_membership_id = upsert_membership(&mut tx, membership_ids[1], admin_user_id, account_id, admin_role_id, Some(business_id), None).await?;
    let manager_one_membership_id = upsert_membership(&mut tx, membership_ids[2], manager_one_user_id, account_id, manager_role_id, Some(business_id), Some(unit_one_id)).await?;
    let cashier_one_membership_id = upsert_membership(&mut tx, membership_ids[3], cashier_one_user_id, account_id, cashier_role_id, Some(business_id), Some(unit_one_id)).await?;
    let manager_two_membership_id = upsert_membership(&mut tx, membership_ids[4], manager_two_user_id, account_id, manager_role_id, Some(business_id), Some(unit_two_id)).await?;
    let cashier_two_membership_id = upsert_membership(&mut tx, membership_ids[5], cashier_two_user_id, account_id, cashier_role_id, Some(business_id), Some(unit_two_id)).await?;

    grant_business_scope(&mut tx, admin_membership_id, business_id).await?;
    grant_unit_scope(&mut tx, manager_one_membership_id, unit_one_id).await?;
    grant_unit_scope(&mut tx, cashier_one_membership_id, unit_one_id).await?;
    grant_unit_scope(&mut tx, manager_two_membership_id, unit_two_id).await?;
    grant_unit_scope(&mut tx, cashier_two_membership_id, unit_two_id).await?;

    seed_product(&mut tx, account_id, business_id, unit_one_id, "Dashboard Test Product One", "TEST-SHOP-ONE", 25_000).await?;
    seed_product(&mut tx, account_id, business_id, unit_two_id, "Dashboard Test Product Two", "TEST-SHOP-TWO", 35_000).await?;

    sqlx::query("delete from refresh_tokens where user_id = any($1)").bind(&test_user_ids[..]).execute(&mut *tx).await?;

    let valid_membership_count: i64 = sqlx::query_scalar(r#"
        select count(*) from memberships
        where id = any($1) and status = 'active'
    "#).bind(&membership_ids[..]).fetch_one(&mut *tx).await?;
    if valid_membership_count != membership_ids.len() as i64 {
        return Err(sqlx::Error::Protocol("development dashboard fixture membership verification failed".into()));
    }

    let unit_count: i64 = sqlx::query_scalar(r#"
        select count(*) from business_units
        where id = any($1) and business_id = $2 and status = 'active'
    "#).bind(&[unit_one_id, unit_two_id][..]).bind(business_id).fetch_one(&mut *tx).await?;
    if unit_count != 2 {
        return Err(sqlx::Error::Protocol("development dashboard fixture unit verification failed".into()));
    }

    let _ = master_membership_id;
    tx.commit().await
}

async fn remove_stale_test_access(tx: &mut Transaction<'_, Postgres>, account_id: Uuid, user_ids: &[Uuid], membership_ids: &[Uuid]) -> Result<(), sqlx::Error> {
    sqlx::query("delete from membership_business_scopes where membership_id = any($1)").bind(membership_ids).execute(&mut **tx).await?;
    sqlx::query("delete from membership_business_unit_scopes where membership_id = any($1)").bind(membership_ids).execute(&mut **tx).await?;
    sqlx::query("delete from memberships where business_account_id = $1 and user_id = any($2) and id <> all($3)").bind(account_id).bind(user_ids).bind(membership_ids).execute(&mut **tx).await?;
    Ok(())
}

async fn upsert_user(tx: &mut Transaction<'_, Postgres>, id: Uuid, full_name: &str, email: &str, password_hash: &str) -> Result<Uuid, sqlx::Error> {
    sqlx::query(r#"
        insert into users (id, full_name, email, password_hash, email_verified, status)
        values ($1, $2, $3, $4, true, 'active')
        on conflict (email) do update
          set full_name = excluded.full_name, password_hash = excluded.password_hash,
              email_verified = true, status = 'active', updated_at = now()
    "#).bind(id).bind(full_name).bind(email).bind(password_hash).execute(&mut **tx).await?;
    sqlx::query_scalar("select id from users where email = $1").bind(email).fetch_one(&mut **tx).await
}

async fn upsert_business(tx: &mut Transaction<'_, Postgres>, account_id: Uuid, id: Uuid, name: &str, business_type: &str, country: &str, currency: &str) -> Result<(), sqlx::Error> {
    sqlx::query(r#"
        insert into businesses (id, business_account_id, name, business_type, country, currency, status)
        values ($1, $2, $3, $4, $5, $6, 'active')
        on conflict (id) do update set name = excluded.name, business_type = excluded.business_type,
          country = excluded.country, currency = excluded.currency, status = 'active', updated_at = now()
    "#).bind(id).bind(account_id).bind(name).bind(business_type).bind(country).bind(currency).execute(&mut **tx).await?;
    Ok(())
}

async fn upsert_unit(tx: &mut Transaction<'_, Postgres>, account_id: Uuid, business_id: Uuid, id: Uuid, name: &str, unit_type: &str, location: &str) -> Result<(), sqlx::Error> {
    sqlx::query(r#"
        insert into business_units (id, business_account_id, business_id, name, unit_type, location, status)
        values ($1, $2, $3, $4, $5, $6, 'active')
        on conflict (id) do update set business_id = excluded.business_id, name = excluded.name,
          unit_type = excluded.unit_type, location = excluded.location, status = 'active', updated_at = now()
    "#).bind(id).bind(account_id).bind(business_id).bind(name).bind(unit_type).bind(location).execute(&mut **tx).await?;
    Ok(())
}

async fn upsert_role(tx: &mut Transaction<'_, Postgres>, account_id: Uuid, code: &str, name: &str, description: &str, permissions: &[&str]) -> Result<Uuid, sqlx::Error> {
    let role_id = Uuid::new_v4();
    sqlx::query(r#"
        insert into roles (id, business_account_id, code, name, description, permissions, is_system, status)
        values ($1, $2, $3, $4, $5, $6, true, 'active')
        on conflict (business_account_id, code) do update
          set name = excluded.name, description = excluded.description, permissions = excluded.permissions,
              is_system = true, status = 'active', updated_at = now()
    "#).bind(role_id).bind(account_id).bind(code).bind(name).bind(description).bind(permissions).execute(&mut **tx).await?;
    sqlx::query_scalar("select id from roles where business_account_id = $1 and code = $2").bind(account_id).bind(code).fetch_one(&mut **tx).await
}

async fn upsert_membership(tx: &mut Transaction<'_, Postgres>, id: Uuid, user_id: Uuid, account_id: Uuid, role_id: Uuid, business_id: Option<Uuid>, business_unit_id: Option<Uuid>) -> Result<Uuid, sqlx::Error> {
    sqlx::query(r#"
        insert into memberships (id, user_id, business_account_id, role_id, business_id, business_unit_id, status)
        values ($1, $2, $3, $4, $5, $6, 'active')
        on conflict (id) do update set user_id = excluded.user_id, business_account_id = excluded.business_account_id,
          role_id = excluded.role_id, business_id = excluded.business_id, business_unit_id = excluded.business_unit_id,
          status = 'active', updated_at = now()
    "#).bind(id).bind(user_id).bind(account_id).bind(role_id).bind(business_id).bind(business_unit_id).execute(&mut **tx).await?;
    Ok(id)
}

async fn grant_business_scope(tx: &mut Transaction<'_, Postgres>, membership_id: Uuid, business_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("insert into membership_business_scopes (membership_id, business_id) values ($1, $2) on conflict do nothing").bind(membership_id).bind(business_id).execute(&mut **tx).await?;
    Ok(())
}

async fn grant_unit_scope(tx: &mut Transaction<'_, Postgres>, membership_id: Uuid, unit_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("insert into membership_business_unit_scopes (membership_id, business_unit_id) values ($1, $2) on conflict do nothing").bind(membership_id).bind(unit_id).execute(&mut **tx).await?;
    Ok(())
}

async fn seed_product(tx: &mut Transaction<'_, Postgres>, account_id: Uuid, business_id: Uuid, unit_id: Uuid, name: &str, sku: &str, price: i64) -> Result<(), sqlx::Error> {
    sqlx::query(r#"
        insert into products (id, business_account_id, business_id, business_unit_id, name, sku, category, default_price, available_quantity, status)
        values (gen_random_uuid(), $1, $2, $3, $4, $5, 'test', $6, 25, 'active')
        on conflict (business_unit_id, lower(sku)) where sku is not null and status = 'active'
        do update set name = excluded.name, default_price = excluded.default_price,
          available_quantity = excluded.available_quantity, updated_at = now()
    "#).bind(account_id).bind(business_id).bind(unit_id).bind(name).bind(sku).bind(price).execute(&mut **tx).await?;
    Ok(())
}

fn hash(password_value: &str) -> Result<String, sqlx::Error> {
    password::hash(password_value).map_err(|error| sqlx::Error::Protocol(format!("development password hashing failed: {error}").into()))
}

fn uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).expect("development fixture UUID must be valid")
}
