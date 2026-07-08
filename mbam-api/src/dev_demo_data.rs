//! Development-only demo data: a fully separate, richly populated business
//! account used to browse realistic dashboards while developing.
//!
//! This is deliberately isolated from `dev_seed.rs`'s minimal fixture, which
//! `checklist_tests.rs`'s Rust integration tests assert exact product and
//! transaction lists against. Nothing in this module shares an ID, a
//! business, a shop, or a user with that fixture, and nothing here is ever
//! invoked from `checklist_tests.rs` — so this data can grow or change
//! freely without any risk of breaking `cargo test`.
//!
//! Two pieces:
//! - [`seed_demo_business`] runs once at server startup: upserts the demo
//!   account/business/shops/users/products, then rebuilds a ~20-day
//!   historical transaction backfill (deleted and regenerated on every
//!   restart so it always looks like "the last 20 days", not stale fixed
//!   dates). Only rows tagged with the `demo-seed-backfill-` idempotency-key
//!   prefix are touched by this rebuild.
//! - [`spawn_demo_traffic_worker`] runs for the lifetime of the server:
//!   periodically inserts one new "live" transaction dated *now*, so the
//!   demo dashboards keep gaining fresh activity the longer the dev server
//!   stays up. These rows are never deleted by a restart, so real usage
//!   history accumulates across dev sessions.

use std::time::Duration as StdDuration;

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::security::password;

const ACCOUNT_ID: &str = "30000000-0000-4000-8000-000000000001";
const BUSINESS_ID: &str = "30000000-0000-4000-8000-000000000201";
const MASTER_MEMBERSHIP_ID: &str = "30000000-0000-4000-8000-000000000400";
const ADMIN_MEMBERSHIP_ID: &str = "30000000-0000-4000-8000-000000000401";
const MANAGER_MEMBERSHIP_IDS: [&str; 3] = [
    "30000000-0000-4000-8000-000000000402",
    "30000000-0000-4000-8000-000000000404",
    "30000000-0000-4000-8000-000000000406",
];
const CASHIER_MEMBERSHIP_IDS: [&str; 3] = [
    "30000000-0000-4000-8000-000000000403",
    "30000000-0000-4000-8000-000000000405",
    "30000000-0000-4000-8000-000000000407",
];

const UNIT_IDS: [&str; 3] = [
    "30000000-0000-4000-8000-000000000301",
    "30000000-0000-4000-8000-000000000302",
    "30000000-0000-4000-8000-000000000303",
];
const UNIT_NAMES: [&str; 3] = [
    "Douala Central Shop",
    "Yaounde Mokolo Shop",
    "Bafoussam Market Shop",
];
const UNIT_LOCATIONS: [&str; 3] = [
    "Akwa, Douala",
    "Mokolo, Yaounde",
    "Marche A, Bafoussam",
];

struct DemoUser {
    id: &'static str,
    full_name: &'static str,
    email: &'static str,
    password: &'static str,
}

const MASTER: DemoUser = DemoUser {
    id: "30000000-0000-4000-8000-000000000100",
    full_name: "Mbam Demo Master Owner",
    email: "master.demo@mbam.local",
    password: "DemoMaster123",
};
const ADMIN: DemoUser = DemoUser {
    id: "30000000-0000-4000-8000-000000000101",
    full_name: "Mbam Demo Business Admin",
    email: "admin.demo@mbam.local",
    password: "DemoAdmin123",
};
const MANAGERS: [DemoUser; 3] = [
    DemoUser {
        id: "30000000-0000-4000-8000-000000000102",
        full_name: "Mbam Demo Shop Manager One",
        email: "manager1.demo@mbam.local",
        password: "DemoManager123",
    },
    DemoUser {
        id: "30000000-0000-4000-8000-000000000104",
        full_name: "Mbam Demo Shop Manager Two",
        email: "manager2.demo@mbam.local",
        password: "DemoManager123",
    },
    DemoUser {
        id: "30000000-0000-4000-8000-000000000106",
        full_name: "Mbam Demo Shop Manager Three",
        email: "manager3.demo@mbam.local",
        password: "DemoManager123",
    },
];
const CASHIERS: [DemoUser; 3] = [
    DemoUser {
        id: "30000000-0000-4000-8000-000000000103",
        full_name: "Mbam Demo Cashier One",
        email: "cashier1.demo@mbam.local",
        password: "DemoCashier123",
    },
    DemoUser {
        id: "30000000-0000-4000-8000-000000000105",
        full_name: "Mbam Demo Cashier Two",
        email: "cashier2.demo@mbam.local",
        password: "DemoCashier123",
    },
    DemoUser {
        id: "30000000-0000-4000-8000-000000000107",
        full_name: "Mbam Demo Cashier Three",
        email: "cashier3.demo@mbam.local",
        password: "DemoCashier123",
    },
];

struct DemoProduct {
    unit_index: usize,
    id: &'static str,
    name: &'static str,
    sku: &'static str,
    category: &'static str,
    cost_price: f64,
    default_price: f64,
}

static PRODUCTS: [DemoProduct; 12] = [
    DemoProduct { unit_index: 0, id: "30000000-0000-4000-8000-000000000501", name: "Rice Bag 25kg", sku: "DEMO-S1-RICE", category: "Groceries", cost_price: 20_000.0, default_price: 25_000.0 },
    DemoProduct { unit_index: 0, id: "30000000-0000-4000-8000-000000000502", name: "Cooking Oil 5L", sku: "DEMO-S1-OIL", category: "Groceries", cost_price: 5_200.0, default_price: 6_500.0 },
    DemoProduct { unit_index: 0, id: "30000000-0000-4000-8000-000000000503", name: "Sugar 1kg", sku: "DEMO-S1-SUGAR", category: "Groceries", cost_price: 700.0, default_price: 1_000.0 },
    DemoProduct { unit_index: 0, id: "30000000-0000-4000-8000-000000000504", name: "Bluetooth Earphones", sku: "DEMO-S1-EARP", category: "Electronics", cost_price: 4_000.0, default_price: 6_000.0 },
    DemoProduct { unit_index: 1, id: "30000000-0000-4000-8000-000000000505", name: "Phone Charger", sku: "DEMO-S2-CHRG", category: "Electronics", cost_price: 1_500.0, default_price: 2_500.0 },
    DemoProduct { unit_index: 1, id: "30000000-0000-4000-8000-000000000506", name: "USB Cable", sku: "DEMO-S2-USB", category: "Electronics", cost_price: 800.0, default_price: 1_500.0 },
    DemoProduct { unit_index: 1, id: "30000000-0000-4000-8000-000000000507", name: "Milk Powder Tin", sku: "DEMO-S2-MILK", category: "Groceries", cost_price: 3_200.0, default_price: 4_000.0 },
    DemoProduct { unit_index: 1, id: "30000000-0000-4000-8000-000000000508", name: "Beans 5kg", sku: "DEMO-S2-BEANS", category: "Groceries", cost_price: 4_500.0, default_price: 5_500.0 },
    DemoProduct { unit_index: 2, id: "30000000-0000-4000-8000-000000000509", name: "Power Bank 10000mAh", sku: "DEMO-S3-PBANK", category: "Electronics", cost_price: 8_000.0, default_price: 12_000.0 },
    DemoProduct { unit_index: 2, id: "30000000-0000-4000-8000-000000000510", name: "Soap Bar Pack", sku: "DEMO-S3-SOAP", category: "Groceries", cost_price: 1_200.0, default_price: 2_000.0 },
    DemoProduct { unit_index: 2, id: "30000000-0000-4000-8000-000000000511", name: "Toothpaste", sku: "DEMO-S3-TOOTH", category: "Groceries", cost_price: 600.0, default_price: 1_000.0 },
    DemoProduct { unit_index: 2, id: "30000000-0000-4000-8000-000000000512", name: "Salt 1kg", sku: "DEMO-S3-SALT", category: "Groceries", cost_price: 300.0, default_price: 500.0 },
];

const CUSTOMER_NAMES: [&str; 10] = [
    "Jean Mbarga", "Marie Fotso", "Aisha Njoya", "Emmanuel Talla", "Grace Ngo Bell",
    "Chantal Abena", "Thierry Onana", "Sandrine Kamga", "Patrick Ekwalla", "Brigitte Nkeng",
];
const PAYMENT_METHODS: [&str; 4] = ["cash", "mobile_money", "card", "bank_transfer"];
const BUSINESS_HOURS: [u32; 8] = [8, 10, 11, 12, 13, 15, 17, 18];
const BACKFILL_DAYS: i64 = 20;
const LIVE_TRAFFIC_INTERVAL_SECS: u64 = 75;
const LIVE_TRAFFIC_INITIAL_DELAY_SECS: u64 = 15;

const MASTER_PERMISSIONS: &[&str] = &[
    "business.create", "business.view", "business.update", "business.disable",
    "unit.create", "unit.view", "unit.update", "unit.disable",
    "worker.invite", "worker.view", "worker.update", "worker.disable",
    "role.create", "role.view", "role.update", "role.assign",
    "sale.create", "sale.view", "sale.refund",
    "product.create", "product.update", "product.view",
    "stock.movement.create", "stock.movement.view",
    "report.view", "report.profit.view", "sync.pull", "sync.push",
    "screen.record_transaction", "screen.transaction_drafts", "screen.transactions",
    "screen.businesses", "screen.team", "screen.products", "screen.stock", "screen.reports",
];
const BUSINESS_ADMIN_PERMISSIONS: &[&str] = &[
    "business.view", "business.update", "unit.view", "unit.create", "unit.update",
    "worker.view", "worker.invite", "worker.update", "worker.disable", "role.assign",
    "sale.create", "sale.view", "sale.refund",
    "product.create", "product.update", "product.view",
    "stock.movement.create", "stock.movement.view",
    "report.view", "report.profit.view", "sync.pull", "sync.push",
    "screen.record_transaction", "screen.transaction_drafts", "screen.transactions",
    "screen.businesses", "screen.team", "screen.products", "screen.stock", "screen.reports",
];
const SHOP_MANAGER_PERMISSIONS: &[&str] = &[
    "business.view", "unit.view", "worker.view", "worker.invite", "worker.update",
    "worker.disable", "role.assign", "sale.create", "sale.view", "sale.refund",
    "product.create", "product.update", "product.view",
    "stock.movement.create", "stock.movement.view", "report.view",
    "sync.pull", "sync.push", "screen.record_transaction", "screen.transaction_drafts",
    "screen.transactions", "screen.businesses", "screen.team", "screen.products", "screen.stock", "screen.reports",
];
const CASHIER_PERMISSIONS: &[&str] = &[
    "business.view", "unit.view", "sale.create", "sale.view",
    "product.create", "product.update", "product.view", "report.view",
    "sync.pull", "sync.push", "screen.record_transaction", "screen.transaction_drafts",
    "screen.transactions", "screen.products", "screen.reports",
];

/// One resolved sale line ready to persist.
struct DemoLine<'a> {
    product: &'a DemoProduct,
    quantity: f64,
    line_total: f64,
}

/// Seeds (or refreshes) the isolated demo business account.
///
/// Safe to call on every server startup: users/business/shops/roles/
/// memberships/products are idempotent upserts, and the historical
/// transaction backfill is rebuilt relative to "now" every time so it never
/// goes stale. Live-traffic transactions inserted by
/// [`spawn_demo_traffic_worker`] between restarts are never touched here.
pub async fn seed_demo_business(db: &PgPool) -> Result<(), sqlx::Error> {
    let account_id = uuid(ACCOUNT_ID);
    let business_id = uuid(BUSINESS_ID);
    let unit_ids: Vec<Uuid> = UNIT_IDS.iter().map(|id| uuid(id)).collect();
    let mut tx = db.begin().await?;

    let master_id = upsert_user(&mut tx, &MASTER).await?;
    let admin_id = upsert_user(&mut tx, &ADMIN).await?;
    let mut manager_ids = Vec::with_capacity(3);
    for manager in &MANAGERS {
        manager_ids.push(upsert_user(&mut tx, manager).await?);
    }
    let mut cashier_ids = Vec::with_capacity(3);
    for cashier in &CASHIERS {
        cashier_ids.push(upsert_user(&mut tx, cashier).await?);
    }

    sqlx::query(
        r#"
        insert into business_accounts (id, name, owner_user_id, status)
        values ($1, 'Mbam Demo Retail Group', $2, 'active')
        on conflict (id) do update
          set name = excluded.name, owner_user_id = excluded.owner_user_id,
              status = 'active', updated_at = now()
    "#,
    )
    .bind(account_id)
    .bind(master_id)
    .execute(&mut *tx)
    .await?;

    upsert_business(&mut tx, account_id, business_id, "Mbam Demo Retail Group", "Retail", "Cameroon", "XAF").await?;

    for (index, unit_id) in unit_ids.iter().enumerate() {
        upsert_unit(&mut tx, account_id, business_id, *unit_id, UNIT_NAMES[index], "shop", UNIT_LOCATIONS[index]).await?;
    }

    let master_role_id = upsert_role(&mut tx, account_id, "master_owner", "Master Owner", "Full access to the demo retail group.", MASTER_PERMISSIONS).await?;
    let admin_role_id = upsert_role(&mut tx, account_id, "business_admin", "Business Admin", "Manage the demo business and all demo shops.", BUSINESS_ADMIN_PERMISSIONS).await?;
    let manager_role_id = upsert_role(&mut tx, account_id, "shop_manager", "Shop Manager", "Manage one assigned demo shop.", SHOP_MANAGER_PERMISSIONS).await?;
    let cashier_role_id = upsert_role(&mut tx, account_id, "cashier", "Cashier", "Record sales in one assigned demo shop.", CASHIER_PERMISSIONS).await?;

    let master_membership_id = upsert_membership(&mut tx, uuid(MASTER_MEMBERSHIP_ID), master_id, account_id, master_role_id, None, None).await?;
    let admin_membership_id = upsert_membership(&mut tx, uuid(ADMIN_MEMBERSHIP_ID), admin_id, account_id, admin_role_id, Some(business_id), None).await?;
    grant_business_scope(&mut tx, admin_membership_id, business_id).await?;
    for unit_id in &unit_ids {
        grant_unit_scope(&mut tx, master_membership_id, *unit_id).await?;
        grant_unit_scope(&mut tx, admin_membership_id, *unit_id).await?;
    }

    for (index, manager_user_id) in manager_ids.iter().enumerate() {
        let membership_id = upsert_membership(&mut tx, uuid(MANAGER_MEMBERSHIP_IDS[index]), *manager_user_id, account_id, manager_role_id, Some(business_id), Some(unit_ids[index])).await?;
        grant_unit_scope(&mut tx, membership_id, unit_ids[index]).await?;
    }
    for (index, cashier_user_id) in cashier_ids.iter().enumerate() {
        let membership_id = upsert_membership(&mut tx, uuid(CASHIER_MEMBERSHIP_IDS[index]), *cashier_user_id, account_id, cashier_role_id, Some(business_id), Some(unit_ids[index])).await?;
        grant_unit_scope(&mut tx, membership_id, unit_ids[index]).await?;
    }

    for product in PRODUCTS.iter() {
        upsert_product(&mut tx, account_id, business_id, unit_ids[product.unit_index], product).await?;
    }

    // Rebuild only the tagged historical backfill so it always represents
    // "the last BACKFILL_DAYS days" relative to now; live-traffic rows
    // (a different idempotency-key prefix) are left untouched and keep
    // accumulating across restarts.
    sqlx::query(
        r#"
        delete from transaction_lines
        where transaction_id in (
          select id from transactions
          where business_account_id = $1 and idempotency_key like 'demo-seed-backfill-%'
        )
    "#,
    )
    .bind(account_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("delete from transactions where business_account_id = $1 and idempotency_key like 'demo-seed-backfill-%'")
        .bind(account_id)
        .execute(&mut *tx)
        .await?;

    let mut sequence: u32 = 0;
    for day_offset in 1..=BACKFILL_DAYS {
        let count = 4 + (day_offset as u32 % 4);
        for i in 0..count {
            sequence += 1;
            let unit_index = ((day_offset as u32 + i) % 3) as usize;
            let hour = BUSINESS_HOURS[(sequence as usize) % BUSINESS_HOURS.len()];
            let minute = sequence % 60;
            let employee_id = if sequence % 3 == 0 { manager_ids[unit_index] } else { cashier_ids[unit_index] };
            let naive = Utc::now()
                .date_naive()
                .and_hms_opt(hour, minute, 0)
                .expect("valid seeded time")
                - chrono::Duration::days(day_offset);
            let created_at = naive.and_utc();

            let fields = demo_transaction_fields(sequence, unit_index, employee_id);
            insert_transaction_with_lines(
                &mut tx,
                Uuid::new_v4(),
                account_id,
                business_id,
                unit_ids[unit_index],
                fields.employee_id,
                fields.customer_name,
                fields.payment_method,
                fields.payment_status,
                fields.status,
                fields.outstanding_amount,
                fields.total_amount,
                &format!("demo-seed-backfill-{sequence:04}"),
                created_at,
                &fields.lines,
            )
            .await?;
        }
    }

    tx.commit().await
}

/// Spawns a background task that inserts one realistic "live" demo
/// transaction every [`LIVE_TRAFFIC_INTERVAL_SECS`] seconds for as long as
/// the server runs, so the demo dashboards keep showing fresh, growing
/// activity. Never invoked outside development (callers gate on
/// `config.app_env`); failures are logged and retried on the next tick, not
/// fatal to the server.
pub fn spawn_demo_traffic_worker(db: PgPool) {
    tokio::spawn(async move {
        tokio::time::sleep(StdDuration::from_secs(LIVE_TRAFFIC_INITIAL_DELAY_SECS)).await;
        let mut tick: u32 = 0;
        loop {
            tick += 1;
            if let Err(error) = insert_live_transaction(&db, tick).await {
                tracing::warn!(?error, "demo live-traffic transaction insert failed");
            } else {
                tracing::debug!(tick, "inserted demo live-traffic transaction");
            }
            tokio::time::sleep(StdDuration::from_secs(LIVE_TRAFFIC_INTERVAL_SECS)).await;
        }
    });
}

async fn insert_live_transaction(db: &PgPool, tick: u32) -> Result<(), sqlx::Error> {
    let unit_index = (tick as usize) % 3;
    let manager_id = uuid(MANAGERS[unit_index].id);
    let cashier_id = uuid(CASHIERS[unit_index].id);
    let employee_id = if tick % 3 == 0 { manager_id } else { cashier_id };
    let fields = demo_transaction_fields(tick, unit_index, employee_id);

    let mut tx = db.begin().await?;
    insert_transaction_with_lines(
        &mut tx,
        Uuid::new_v4(),
        uuid(ACCOUNT_ID),
        uuid(BUSINESS_ID),
        uuid(UNIT_IDS[unit_index]),
        fields.employee_id,
        fields.customer_name,
        fields.payment_method,
        fields.payment_status,
        fields.status,
        fields.outstanding_amount,
        fields.total_amount,
        &format!("demo-live-{}", Uuid::new_v4()),
        Utc::now(),
        &fields.lines,
    )
    .await?;
    tx.commit().await
}

struct DemoTransactionFields<'a> {
    employee_id: Uuid,
    customer_name: &'static str,
    payment_method: &'static str,
    payment_status: &'static str,
    status: &'static str,
    outstanding_amount: f64,
    total_amount: f64,
    lines: Vec<DemoLine<'a>>,
}

/// Deterministically derives one plausible sale's fields from a sequence
/// number, so both the historical backfill and the live-traffic worker
/// generate varied-looking but fully reproducible data without a `rand`
/// dependency.
fn demo_transaction_fields(sequence: u32, unit_index: usize, employee_id: Uuid) -> DemoTransactionFields<'static> {
    let unit_products: Vec<&DemoProduct> = PRODUCTS.iter().filter(|product| product.unit_index == unit_index).collect();
    let line_count = 1 + (sequence % 2) as usize;
    let mut lines = Vec::with_capacity(line_count);
    let mut total_amount = 0.0f64;
    for line_index in 0..line_count {
        let product = unit_products[(sequence as usize + line_index) % unit_products.len()];
        let quantity = (1 + (sequence + line_index as u32) % 4) as f64;
        let line_total = quantity * product.default_price;
        total_amount += line_total;
        lines.push(DemoLine { product, quantity, line_total });
    }

    let is_refunded = sequence % 23 == 0;
    let is_pending = !is_refunded && sequence % 11 == 0;
    let status = if is_refunded { "refunded" } else { "completed" };
    let (payment_status, outstanding_amount) = if is_pending {
        ("pending", total_amount * 0.4)
    } else {
        ("paid", 0.0)
    };

    DemoTransactionFields {
        employee_id,
        customer_name: CUSTOMER_NAMES[(sequence as usize) % CUSTOMER_NAMES.len()],
        payment_method: PAYMENT_METHODS[(sequence as usize) % PAYMENT_METHODS.len()],
        payment_status,
        status,
        outstanding_amount,
        total_amount,
        lines,
    }
}

#[allow(clippy::too_many_arguments)]
async fn insert_transaction_with_lines(
    tx: &mut Transaction<'_, Postgres>,
    transaction_id: Uuid,
    account_id: Uuid,
    business_id: Uuid,
    unit_id: Uuid,
    employee_id: Uuid,
    customer_name: &str,
    payment_method: &str,
    payment_status: &str,
    status: &str,
    outstanding_amount: f64,
    total_amount: f64,
    idempotency_key: &str,
    created_at: DateTime<Utc>,
    lines: &[DemoLine<'_>],
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into transactions (
          id, business_account_id, business_id, business_unit_id, customer_name,
          payment_method, payment_status, status, outstanding_amount, total_amount,
          recorded_by_user_id, idempotency_key, created_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    "#,
    )
    .bind(transaction_id)
    .bind(account_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(customer_name)
    .bind(payment_method)
    .bind(payment_status)
    .bind(status)
    .bind(outstanding_amount)
    .bind(total_amount)
    .bind(employee_id)
    .bind(idempotency_key)
    .bind(created_at)
    .execute(&mut **tx)
    .await?;

    for line in lines {
        sqlx::query(
            r#"
            insert into transaction_lines (
              transaction_id, product_id, product_name_snapshot, sku_snapshot,
              quantity, unit_price, line_total
            ) values ($1, $2, $3, $4, $5, $6, $7)
        "#,
        )
        .bind(transaction_id)
        .bind(uuid(line.product.id))
        .bind(line.product.name)
        .bind(line.product.sku)
        .bind(line.quantity)
        .bind(line.product.default_price)
        .bind(line.line_total)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

fn uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).expect("static demo data UUID must be valid")
}

fn hash(value: &str) -> Result<String, sqlx::Error> {
    password::hash_password(value).map_err(|error| sqlx::Error::Protocol(format!("failed to hash demo password: {error}")))
}

async fn upsert_user(tx: &mut Transaction<'_, Postgres>, user: &DemoUser) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into users (id, full_name, email, password_hash, email_verified, status)
        values ($1, $2, $3, $4, true, 'active')
        on conflict (email) do update
          set full_name = excluded.full_name, password_hash = excluded.password_hash,
              email_verified = true, status = 'active', updated_at = now()
        returning id
    "#,
    )
    .bind(uuid(user.id))
    .bind(user.full_name)
    .bind(user.email)
    .bind(hash(user.password)?)
    .fetch_one(&mut **tx)
    .await
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
          set business_account_id = excluded.business_account_id, name = excluded.name,
              business_type = excluded.business_type, country = excluded.country,
              currency = excluded.currency, status = 'active', updated_at = now()
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
          set business_account_id = excluded.business_account_id, business_id = excluded.business_id,
              name = excluded.name, unit_type = excluded.unit_type, location = excluded.location,
              status = 'active', updated_at = now()
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
          set user_id = excluded.user_id, business_account_id = excluded.business_account_id,
              business_id = excluded.business_id, business_unit_id = excluded.business_unit_id,
              role_id = excluded.role_id, status = 'active', updated_at = now()
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

async fn grant_business_scope(tx: &mut Transaction<'_, Postgres>, membership_id: Uuid, business_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("insert into membership_business_scopes (membership_id, business_id) values ($1, $2) on conflict do nothing")
        .bind(membership_id)
        .bind(business_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn grant_unit_scope(tx: &mut Transaction<'_, Postgres>, membership_id: Uuid, unit_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("insert into membership_business_unit_scopes (membership_id, business_unit_id) values ($1, $2) on conflict do nothing")
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
    product: &DemoProduct,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into products (
          id, business_account_id, business_id, business_unit_id, name, sku,
          category, available_quantity, low_stock_threshold, cost_price, default_price, status
        )
        values ($1, $2, $3, $4, $5, $6, $7, 300, 20, $8, $9, 'active')
        on conflict (id) do update
          set business_account_id = excluded.business_account_id, business_id = excluded.business_id,
              business_unit_id = excluded.business_unit_id, name = excluded.name, sku = excluded.sku,
              category = excluded.category, cost_price = excluded.cost_price,
              default_price = excluded.default_price, status = 'active', updated_at = now()
    "#,
    )
    .bind(uuid(product.id))
    .bind(account_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(product.name)
    .bind(product.sku)
    .bind(product.category)
    .bind(product.cost_price)
    .bind(product.default_price)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
