use std::sync::{Mutex, MutexGuard};

use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
    Router,
};
use once_cell::sync::Lazy;
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::util::ServiceExt;
use uuid::Uuid;

use crate::{
    authentication::AuthenticationLayer,
    config::Config,
    db::pool::connect_database,
    dev_seed,
    dev_seed_cleanup,
    security::tokens,
    state::AppState,
};

const ACCOUNT_ID: &str = "10000000-0000-4000-8000-000000000001";
const MASTER_USER_ID: &str = "10000000-0000-4000-8000-000000000100";
const ADMIN_USER_ID: &str = "10000000-0000-4000-8000-000000000101";
const MANAGER_ONE_USER_ID: &str = "10000000-0000-4000-8000-000000000102";
const CASHIER_ONE_USER_ID: &str = "10000000-0000-4000-8000-000000000103";
const CASHIER_TWO_USER_ID: &str = "10000000-0000-4000-8000-000000000105";
const BUSINESS_ONE_ID: &str = "10000000-0000-4000-8000-000000000201";
const BUSINESS_TWO_ID: &str = "10000000-0000-4000-8000-000000000202";
const UNIT_ONE_ID: &str = "10000000-0000-4000-8000-000000000301";
const UNIT_TWO_ID: &str = "10000000-0000-4000-8000-000000000302";
const UNIT_THREE_ID: &str = "10000000-0000-4000-8000-000000000303";
const PRODUCT_ONE_ID: &str = "10000000-0000-4000-8000-000000000501";
const PRODUCT_TWO_ID: &str = "10000000-0000-4000-8000-000000000502";
const PRODUCT_THREE_ID: &str = "10000000-0000-4000-8000-000000000503";
const PRODUCT_CREATE_ID: &str = "10000000-0000-4000-8000-000000000504";
const STOCK_PRODUCT_SCOPE_ID: &str = "10000000-0000-4000-8000-000000000505";
const STOCK_PRODUCT_BLOCK_ID: &str = "10000000-0000-4000-8000-000000000506";
const TRANSACTION_ONE_ID: &str = "10000000-0000-4000-8000-000000000601";
const TRANSACTION_TWO_ID: &str = "10000000-0000-4000-8000-000000000602";
const TRANSACTION_THREE_ID: &str = "10000000-0000-4000-8000-000000000603";
const TRANSACTION_CREATE_ID: &str = "10000000-0000-4000-8000-000000000604";
const STOCK_SALE_TRANSACTION_ID: &str = "10000000-0000-4000-8000-000000000605";
const STOCK_SALE_BLOCKED_TRANSACTION_ID: &str = "10000000-0000-4000-8000-000000000606";
const TEST_JWT_SECRET: &str = "integration_test_access_secret_1234567890";

static TEST_MUTEX: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

struct TestApp {
    app: Router,
    db: PgPool,
}

#[tokio::test(flavor = "current_thread")]
async fn manager_scope_tests_cover_shop_resources_and_report_denials() {
    let _guard = test_guard();
    let app = test_app().await;

    let (status, workspace) = app
        .request_json(Method::GET, "/api/v1/team-members", uuid(MANAGER_ONE_USER_ID), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let members = workspace["members"].as_array().expect("members array");
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["user_id"], CASHIER_ONE_USER_ID);
    assert!(members.iter().all(|member| member["user_id"] != CASHIER_TWO_USER_ID));

    let (status, units) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/businesses/{BUSINESS_ONE_ID}/units"),
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(units["error"], "forbidden");

    let (status, products) = app
        .request_json(Method::GET, "/api/v1/products", uuid(MANAGER_ONE_USER_ID), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let product_ids = ids(&products);
    assert_eq!(product_ids, vec![PRODUCT_ONE_ID.to_string()]);

    let (status, transactions) = app
        .request_json(
            Method::GET,
            "/api/v1/transactions",
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let transaction_ids = ids(&transactions);
    assert_eq!(transaction_ids, vec![TRANSACTION_ONE_ID.to_string()]);

    let (status, _) = app
        .request_json(
            Method::PATCH,
            &format!("/api/v1/products/{PRODUCT_TWO_ID}"),
            uuid(MANAGER_ONE_USER_ID),
            Some(product_payload(PRODUCT_TWO_ID, BUSINESS_ONE_ID, UNIT_TWO_ID, "Forbidden update")),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/transactions/{TRANSACTION_TWO_ID}"),
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/shops?timeframe=daily&business_unit_id={UNIT_TWO_ID}"
            ),
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test(flavor = "current_thread")]
async fn business_admin_cross_business_requests_fail_closed_across_resources() {
    let _guard = test_guard();
    let app = test_app().await;

    let (status, businesses) = app
        .request_json(Method::GET, "/api/v1/businesses", uuid(ADMIN_USER_ID), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let business_ids = ids(&businesses);
    assert_eq!(business_ids, vec![BUSINESS_ONE_ID.to_string()]);

    let (status, _) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/businesses/{BUSINESS_TWO_ID}/units"),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, products) = app
        .request_json(Method::GET, "/api/v1/products", uuid(ADMIN_USER_ID), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let product_ids = ids(&products);
    assert_eq!(
        product_ids,
        vec![PRODUCT_TWO_ID.to_string(), PRODUCT_ONE_ID.to_string()]
    );

    let (status, transactions) = app
        .request_json(
            Method::GET,
            "/api/v1/transactions",
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let transaction_ids = ids(&transactions);
    assert_eq!(
        transaction_ids,
        vec![TRANSACTION_TWO_ID.to_string(), TRANSACTION_ONE_ID.to_string()]
    );

    let (status, _) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/transactions/{TRANSACTION_THREE_ID}"),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/businesses?timeframe=daily&business_id={BUSINESS_TWO_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test(flavor = "current_thread")]
async fn authorization_bootstrap_and_audit_events_cover_required_actions() {
    let _guard = test_guard();
    let app = test_app().await;

    let (status, manager_bootstrap) = app
        .request_json(
            Method::GET,
            "/api/v1/me/authorization",
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let manager_routes = route_keys(&manager_bootstrap);
    assert!(manager_routes.contains(&"team".to_string()));
    assert!(manager_routes.contains(&"products".to_string()));
    assert!(manager_routes.contains(&"reports".to_string()));
    assert!(manager_routes.contains(&"shops".to_string()));
    assert!(!manager_routes.contains(&"businesses".to_string()));

    let (status, cashier_bootstrap) = app
        .request_json(
            Method::GET,
            "/api/v1/me/authorization",
            uuid(CASHIER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let cashier_routes = route_keys(&cashier_bootstrap);
    assert!(cashier_routes.contains(&"products".to_string()));
    assert!(cashier_routes.contains(&"reports".to_string()));
    assert!(!cashier_routes.contains(&"team".to_string()));
    assert!(!cashier_routes.contains(&"businesses".to_string()));

    let login_before = audit_count_for_actor(
        &app.db,
        "authentication.login",
        uuid(MANAGER_ONE_USER_ID),
    )
    .await;
    let (status, _) = app
        .request_json(
            Method::POST,
            "/api/v1/me/login-event",
            uuid(MANAGER_ONE_USER_ID),
            Some(json!({})),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let login_after = audit_count_for_actor(
        &app.db,
        "authentication.login",
        uuid(MANAGER_ONE_USER_ID),
    )
    .await;
    assert_eq!(login_after, login_before + 1);

    let (status, created_product) = app
        .request_json(
            Method::POST,
            "/api/v1/products",
            uuid(MANAGER_ONE_USER_ID),
            Some(product_payload(
                PRODUCT_CREATE_ID,
                BUSINESS_ONE_ID,
                UNIT_ONE_ID,
                "Checklist Product",
            )),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created_product["id"], PRODUCT_CREATE_ID);
    assert!(
        audit_exists_for_resource(
            &app.db,
            "product.create",
            uuid(PRODUCT_CREATE_ID),
        )
        .await
    );

    let (status, created_transaction) = app
        .request_json(
            Method::POST,
            "/api/v1/transactions",
            uuid(CASHIER_ONE_USER_ID),
            Some(json!({
                "id": TRANSACTION_CREATE_ID,
                "businessId": BUSINESS_ONE_ID,
                "businessUnitId": UNIT_ONE_ID,
                "customerName": "Checklist Customer",
                "customerContact": "+237600000000",
                "paymentMethod": "cash",
                "paymentStatus": "paid",
                "outstandingAmount": 0.0,
                "idempotencyKey": "checklist-transaction-create",
                "lines": [
                    {
                        "productId": PRODUCT_ONE_ID,
                        "productName": "Test Rice Bag 25kg",
                        "sku": "TEST-SHOP1-RICE",
                        "quantity": 1.0,
                        "unitPrice": 25000.0
                    }
                ]
            })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created_transaction["id"], TRANSACTION_CREATE_ID);
    assert!(
        audit_exists_for_resource(
            &app.db,
            "sale.create",
            uuid(TRANSACTION_CREATE_ID),
        )
        .await
    );

    let denied_before = audit_count_for_resource(
        &app.db,
        "authorization.report.denied",
        uuid(UNIT_TWO_ID),
    )
    .await;
    let (status, _) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/shops?timeframe=daily&business_unit_id={UNIT_TWO_ID}"
            ),
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let denied_after = audit_count_for_resource(
        &app.db,
        "authorization.report.denied",
        uuid(UNIT_TWO_ID),
    )
    .await;
    assert_eq!(denied_after, denied_before + 1);
}

#[tokio::test(flavor = "current_thread")]
async fn transaction_detail_report_is_role_gated_and_scoped() {
    let _guard = test_guard();
    let app = test_app().await;

    // Shop managers and cashiers cannot reach the raw line-item detail
    // report at all, even within their own authorized scope -- this is a
    // stricter gate than the aggregate reports, which they can view.
    let (status, _) = app
        .request_json(
            Method::GET,
            "/api/v1/reports/transactions?timeframe=daily",
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = app
        .request_json(
            Method::GET,
            "/api/v1/reports/transactions?timeframe=daily",
            uuid(CASHIER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // Business admin sees only their own business's transactions, never the
    // checklist fixture's second, out-of-scope business.
    let (status, admin_detail) = app
        .request_json(
            Method::GET,
            "/api/v1/reports/transactions?timeframe=daily",
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let admin_transaction_ids = transaction_ids_in_rows(&admin_detail);
    assert!(admin_transaction_ids.contains(&TRANSACTION_ONE_ID.to_string()));
    assert!(admin_transaction_ids.contains(&TRANSACTION_TWO_ID.to_string()));
    assert!(!admin_transaction_ids.contains(&TRANSACTION_THREE_ID.to_string()));

    // An explicit cross-tenant business_ids filter is denied outright, not
    // silently ignored, matching the existing aggregate-report scope checks.
    // (This endpoint's filters are all comma-separated multi-id params --
    // `business_ids`, not the aggregate reports' singular `business_id` --
    // so a stray singular param here would be silently dropped by the query
    // deserializer instead of denying the request.)
    let (status, _) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&business_ids={BUSINESS_TWO_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Master owner's account-wide scope covers both businesses, and a
    // custom date range covering "today" (every fixture transaction is
    // inserted with created_at = now()) returns all three.
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let (status, master_detail) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=custom&start_date={today}&end_date={today}"
            ),
            uuid(MASTER_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let master_transaction_ids = transaction_ids_in_rows(&master_detail);
    assert!(master_transaction_ids.contains(&TRANSACTION_ONE_ID.to_string()));
    assert!(master_transaction_ids.contains(&TRANSACTION_TWO_ID.to_string()));
    assert!(master_transaction_ids.contains(&TRANSACTION_THREE_ID.to_string()));

    // A malformed custom range (end before start) is rejected with 400
    // rather than silently swapped or defaulted to something else.
    let (status, _) = app
        .request_json(
            Method::GET,
            "/api/v1/reports/transactions?timeframe=custom&start_date=2026-03-10&end_date=2026-03-01",
            uuid(MASTER_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // A successful detail view is itself audited, distinct from the
    // "denied" event, so there is a record of who exported raw
    // transaction-level data and when.
    let viewed_count =
        audit_count_for_actor(&app.db, "report.detail.viewed", uuid(ADMIN_USER_ID)).await;
    assert!(viewed_count >= 1);
}

#[tokio::test(flavor = "current_thread")]
async fn transaction_detail_report_supports_multi_entity_filters() {
    let _guard = test_guard();
    let app = test_app().await;

    // Selecting several employees at once (comma-delimited) returns the
    // union of their transactions, not just the first id -- this is the
    // "group the report for more than one employee" behavior the UI's
    // multi-select is built on top of.
    let (status, both_employees) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&employee_ids={CASHIER_ONE_USER_ID},{CASHIER_TWO_USER_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let both_employee_transaction_ids = transaction_ids_in_rows(&both_employees);
    assert!(both_employee_transaction_ids.contains(&TRANSACTION_ONE_ID.to_string()));
    assert!(both_employee_transaction_ids.contains(&TRANSACTION_TWO_ID.to_string()));

    // Narrowing to a single employee in that same multi-id list still
    // excludes the other employee's transaction, confirming the filter is
    // an intersection with scope and a union only across the requested ids.
    let (status, one_employee) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&employee_ids={CASHIER_ONE_USER_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let one_employee_transaction_ids = transaction_ids_in_rows(&one_employee);
    assert!(one_employee_transaction_ids.contains(&TRANSACTION_ONE_ID.to_string()));
    assert!(!one_employee_transaction_ids.contains(&TRANSACTION_TWO_ID.to_string()));

    // Multiple shop ids behave the same way as multiple employee ids.
    let (status, both_shops) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&business_unit_ids={UNIT_ONE_ID},{UNIT_TWO_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let both_shop_transaction_ids = transaction_ids_in_rows(&both_shops);
    assert!(both_shop_transaction_ids.contains(&TRANSACTION_ONE_ID.to_string()));
    assert!(both_shop_transaction_ids.contains(&TRANSACTION_TWO_ID.to_string()));

    // A multi-id shop filter that includes one id outside the caller's
    // authorized scope is denied outright (fail closed on the whole
    // request), matching the existing single-id cross-tenant check --
    // partial/silent filtering of just the unauthorized id would leak which
    // ids exist without saying so.
    let (status, _) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&business_unit_ids={UNIT_ONE_ID},{UNIT_THREE_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // A malformed id anywhere in the comma-separated list is rejected with
    // 400 rather than silently skipped.
    let (status, _) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&employee_ids={CASHIER_ONE_USER_ID},not-a-uuid"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Multiple product ids narrow to just the matching lines' products.
    let (status, both_products) = app
        .request_json(
            Method::GET,
            &format!(
                "/api/v1/reports/transactions?timeframe=daily&product_ids={PRODUCT_ONE_ID},{PRODUCT_TWO_ID}"
            ),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let both_product_transaction_ids = transaction_ids_in_rows(&both_products);
    assert!(both_product_transaction_ids.contains(&TRANSACTION_ONE_ID.to_string()));
    assert!(both_product_transaction_ids.contains(&TRANSACTION_TWO_ID.to_string()));
}

#[tokio::test(flavor = "current_thread")]
async fn stock_movement_endpoints_are_role_gated_and_scoped() {
    let _guard = test_guard();
    let app = test_app().await;

    let (status, _) = app
        .request_json(
            Method::POST,
            "/api/v1/products",
            uuid(ADMIN_USER_ID),
            Some(json!({
                "id": STOCK_PRODUCT_SCOPE_ID,
                "businessId": BUSINESS_ONE_ID,
                "businessUnitId": UNIT_ONE_ID,
                "name": "Stock Scope Test Product",
                "sku": "TEST-STOCK-SCOPE",
                "category": "Groceries",
                "availableQuantity": 20.0,
                "defaultPrice": 1000.0
            })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);

    // Cashiers can sell, but cannot record manual stock movements
    // (purchases, adjustments, transfers) -- only sale.create's own
    // deduction path touches stock for that role.
    let (status, denied) = app
        .request_json(
            Method::POST,
            "/api/v1/stock/movements",
            uuid(CASHIER_ONE_USER_ID),
            Some(json!({
                "productId": STOCK_PRODUCT_SCOPE_ID,
                "movementType": "purchase",
                "quantityDelta": 5.0
            })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(denied["error"], "forbidden");

    // A shop manager scoped to the product's own unit can record one.
    let (status, created) = app
        .request_json(
            Method::POST,
            "/api/v1/stock/movements",
            uuid(MANAGER_ONE_USER_ID),
            Some(json!({
                "productId": STOCK_PRODUCT_SCOPE_ID,
                "movementType": "purchase",
                "quantityDelta": 5.0,
                "note": "  restock from supplier  "
            })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(created["productId"], STOCK_PRODUCT_SCOPE_ID);
    assert_eq!(created["movementType"], "purchase");
    assert_eq!(created["quantityDelta"].as_f64(), Some(5.0));
    assert_eq!(created["note"], "restock from supplier");
    let movement_id = created["id"].as_str().expect("movement id").to_string();
    assert!(audit_exists_for_resource(&app.db, "stock.movement.create", uuid(&movement_id)).await);

    // The same manager cannot touch a product outside their assigned unit.
    let (status, out_of_scope) = app
        .request_json(
            Method::POST,
            "/api/v1/stock/movements",
            uuid(MANAGER_ONE_USER_ID),
            Some(json!({
                "productId": PRODUCT_TWO_ID,
                "movementType": "purchase",
                "quantityDelta": 5.0
            })),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(out_of_scope["error"], "forbidden");

    // "sale" is never a hand-recordable movement type -- only
    // transactions::service::create is allowed to write one.
    let (status, rejected) = app
        .request_json(
            Method::POST,
            "/api/v1/stock/movements",
            uuid(MANAGER_ONE_USER_ID),
            Some(json!({
                "productId": STOCK_PRODUCT_SCOPE_ID,
                "movementType": "sale",
                "quantityDelta": -1.0
            })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(rejected["error"], "bad request: movement type is invalid or not recordable by hand");

    // Listing is scoped the same way -- the manager sees their own
    // movement but nothing from the other business's fixture product.
    let (status, movements) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/stock/movements?product_id={STOCK_PRODUCT_SCOPE_ID}"),
            uuid(MANAGER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let movement_ids = ids(&movements);
    assert_eq!(movement_ids, vec![movement_id]);
}

#[tokio::test(flavor = "current_thread")]
async fn sale_creation_deducts_stock_and_blocks_when_policy_requires_it() {
    let _guard = test_guard();
    let app = test_app().await;

    let (status, _) = app
        .request_json(
            Method::POST,
            "/api/v1/products",
            uuid(ADMIN_USER_ID),
            Some(json!({
                "id": STOCK_PRODUCT_BLOCK_ID,
                "businessId": BUSINESS_ONE_ID,
                "businessUnitId": UNIT_ONE_ID,
                "name": "Stock Block Test Product",
                "sku": "TEST-STOCK-BLOCK",
                "category": "Groceries",
                "availableQuantity": 3.0,
                "defaultPrice": 1000.0,
                "stockPolicy": "block_when_empty"
            })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);

    // A normal sale within available stock succeeds and deducts atomically.
    let (status, sale) = app
        .request_json(
            Method::POST,
            "/api/v1/transactions",
            uuid(CASHIER_ONE_USER_ID),
            Some(json!({
                "id": STOCK_SALE_TRANSACTION_ID,
                "businessId": BUSINESS_ONE_ID,
                "businessUnitId": UNIT_ONE_ID,
                "customerName": "Stock Sale Customer",
                "paymentMethod": "cash",
                "paymentStatus": "paid",
                "outstandingAmount": 0.0,
                "idempotencyKey": "checklist-stock-sale",
                "lines": [
                    {
                        "productId": STOCK_PRODUCT_BLOCK_ID,
                        "productName": "Stock Block Test Product",
                        "sku": "TEST-STOCK-BLOCK",
                        "quantity": 2.0,
                        "unitPrice": 1000.0
                    }
                ]
            })),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(sale["id"], STOCK_SALE_TRANSACTION_ID);

    let (status, products) = app
        .request_json(Method::GET, "/api/v1/products", uuid(ADMIN_USER_ID), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let after_first_sale = products
        .as_array()
        .expect("products array")
        .iter()
        .find(|product| product["id"] == STOCK_PRODUCT_BLOCK_ID)
        .expect("stock block product")
        .clone();
    assert_eq!(after_first_sale["availableQuantity"].as_f64(), Some(1.0));

    let (status, movements) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/stock/movements?product_id={STOCK_PRODUCT_BLOCK_ID}"),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let movement_rows = movements.as_array().expect("movements array");
    assert_eq!(movement_rows.len(), 1);
    assert_eq!(movement_rows[0]["movementType"], "sale");
    assert_eq!(movement_rows[0]["quantityDelta"].as_f64(), Some(-2.0));
    assert_eq!(movement_rows[0]["sourceTransactionId"], STOCK_SALE_TRANSACTION_ID);

    // A second sale for more than the single remaining unit is rejected
    // outright by the block_when_empty policy -- and nothing about it is
    // partially applied: no stock change, no extra ledger row, no
    // transaction row left behind.
    let (status, blocked) = app
        .request_json(
            Method::POST,
            "/api/v1/transactions",
            uuid(CASHIER_ONE_USER_ID),
            Some(json!({
                "id": STOCK_SALE_BLOCKED_TRANSACTION_ID,
                "businessId": BUSINESS_ONE_ID,
                "businessUnitId": UNIT_ONE_ID,
                "customerName": "Stock Sale Customer",
                "paymentMethod": "cash",
                "paymentStatus": "paid",
                "outstandingAmount": 0.0,
                "idempotencyKey": "checklist-stock-sale-blocked",
                "lines": [
                    {
                        "productId": STOCK_PRODUCT_BLOCK_ID,
                        "productName": "Stock Block Test Product",
                        "sku": "TEST-STOCK-BLOCK",
                        "quantity": 5.0,
                        "unitPrice": 1000.0
                    }
                ]
            })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        blocked["error"],
        format!("bad request: insufficient stock for product {STOCK_PRODUCT_BLOCK_ID}")
    );

    let (status, products_after_block) = app
        .request_json(Method::GET, "/api/v1/products", uuid(ADMIN_USER_ID), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let after_blocked_sale = products_after_block
        .as_array()
        .expect("products array")
        .iter()
        .find(|product| product["id"] == STOCK_PRODUCT_BLOCK_ID)
        .expect("stock block product")
        .clone();
    assert_eq!(after_blocked_sale["availableQuantity"].as_f64(), Some(1.0));

    let (status, movements_after_block) = app
        .request_json(
            Method::GET,
            &format!("/api/v1/stock/movements?product_id={STOCK_PRODUCT_BLOCK_ID}"),
            uuid(ADMIN_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(movements_after_block.as_array().expect("movements array").len(), 1);

    let (status, transactions) = app
        .request_json(
            Method::GET,
            "/api/v1/transactions",
            uuid(CASHIER_ONE_USER_ID),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!ids(&transactions).contains(&STOCK_SALE_BLOCKED_TRANSACTION_ID.to_string()));
}

impl TestApp {
    async fn request_json(
        &self,
        method: Method,
        path: &str,
        user_id: Uuid,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let token = tokens::create_access_token(user_id, TEST_JWT_SECRET, 30)
            .expect("access token");
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(match body {
                Some(value) => Body::from(value.to_string()),
                None => Body::empty(),
            })
            .expect("request");

        let response = self
            .app
            .clone()
            .oneshot(request)
            .await
            .expect("response");
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes)
                .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).to_string()))
        };
        (status, value)
    }
}

async fn test_app() -> TestApp {
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgres://mbam:change_this_local_database_password@127.0.0.1:5433/mbam".to_string()
    });
    let db = connect_database(&database_url)
        .await
        .expect("connect test database");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("run migrations");
    clear_checklist_fixture(&db)
        .await
        .expect("cleanup checklist fixture");
    dev_seed_cleanup::cleanup_test_fixture(&db)
        .await
        .expect("cleanup base fixture");
    dev_seed::seed_test_accounts(&db)
        .await
        .expect("seed base fixture");
    upsert_checklist_fixture(&db)
        .await
        .expect("seed checklist fixture");

    let config = test_config(database_url);
    let authentication =
        AuthenticationLayer::from_config(&config).expect("build authentication layer");
    let state = AppState::new(config, db.clone(), authentication);

    TestApp {
        app: super::build_router(state),
        db,
    }
}

async fn upsert_checklist_fixture(db: &PgPool) -> Result<(), sqlx::Error> {
    clear_checklist_fixture(db).await?;

    let account_id = uuid(ACCOUNT_ID);
    let business_two_id = uuid(BUSINESS_TWO_ID);
    let unit_three_id = uuid(UNIT_THREE_ID);

    sqlx::query(
        r#"
        insert into businesses (
          id, business_account_id, name, business_type, country, currency, status
        ) values ($1, $2, 'Checklist Second Business', 'Retail', 'Cameroon', 'XAF', 'active')
        "#,
    )
    .bind(business_two_id)
    .bind(account_id)
    .execute(db)
    .await?;

    sqlx::query(
        r#"
        insert into business_units (
          id, business_account_id, business_id, name, unit_type, location, status
        ) values ($1, $2, $3, 'Checklist Third Shop', 'shop', 'Bastos, Yaounde', 'active')
        "#,
    )
    .bind(unit_three_id)
    .bind(account_id)
    .bind(business_two_id)
    .execute(db)
    .await?;

    sqlx::query(
        r#"
        insert into products (
          id, business_account_id, business_id, business_unit_id, name, sku, category,
          available_quantity, default_price, status
        ) values ($1, $2, $3, $4, 'Checklist Cross-Business Product', 'TEST-BUSINESS2',
                  'Groceries', 5, 8500, 'active')
        "#,
    )
    .bind(uuid(PRODUCT_THREE_ID))
    .bind(account_id)
    .bind(business_two_id)
    .bind(unit_three_id)
    .execute(db)
    .await?;

    insert_transaction(
        db,
        uuid(TRANSACTION_ONE_ID),
        account_id,
        uuid(BUSINESS_ONE_ID),
        uuid(UNIT_ONE_ID),
        uuid(CASHIER_ONE_USER_ID),
        uuid(PRODUCT_ONE_ID),
        "manager-visible-transaction",
        "Manager Scope Customer",
        "Test Rice Bag 25kg",
        "TEST-SHOP1-RICE",
        25_000.0,
    )
    .await?;
    insert_transaction(
        db,
        uuid(TRANSACTION_TWO_ID),
        account_id,
        uuid(BUSINESS_ONE_ID),
        uuid(UNIT_TWO_ID),
        uuid(CASHIER_TWO_USER_ID),
        uuid(PRODUCT_TWO_ID),
        "other-shop-transaction",
        "Other Shop Customer",
        "Test Cooking Oil 5L",
        "TEST-SHOP2-OIL",
        6_500.0,
    )
    .await?;
    insert_transaction(
        db,
        uuid(TRANSACTION_THREE_ID),
        account_id,
        business_two_id,
        unit_three_id,
        uuid(MASTER_USER_ID),
        uuid(PRODUCT_THREE_ID),
        "other-business-transaction",
        "Other Business Customer",
        "Checklist Cross-Business Product",
        "TEST-BUSINESS2",
        8_500.0,
    )
    .await
}

async fn clear_checklist_fixture(db: &PgPool) -> Result<(), sqlx::Error> {
    // `report.detail.viewed` / `authorization.report.denied` audit events
    // (see reports::service::transaction_detail) record `business_id`/
    // `business_unit_id` directly, with `resource_id` left `None` and the
    // actor being whichever role made the request (e.g. business_admin or
    // master_owner, not just the manager/cashier accounts below) -- so this
    // cleanup must also match on the business/unit id columns themselves,
    // not only `resource_id` and a fixed actor list, or a leftover row will
    // block the next test run's `delete from businesses`/`business_units`
    // with a foreign key violation.
    sqlx::query(
        "delete from audit_logs \
         where resource_id = any($1) \
            or actor_user_id = any($2) \
            or business_id = any($1) \
            or business_unit_id = any($1)",
    )
    .bind(vec![
        uuid(BUSINESS_TWO_ID),
        uuid(UNIT_THREE_ID),
        uuid(PRODUCT_THREE_ID),
        uuid(PRODUCT_CREATE_ID),
        uuid(STOCK_PRODUCT_SCOPE_ID),
        uuid(STOCK_PRODUCT_BLOCK_ID),
        uuid(TRANSACTION_ONE_ID),
        uuid(TRANSACTION_TWO_ID),
        uuid(TRANSACTION_THREE_ID),
        uuid(TRANSACTION_CREATE_ID),
        uuid(STOCK_SALE_TRANSACTION_ID),
        uuid(STOCK_SALE_BLOCKED_TRANSACTION_ID),
        uuid(UNIT_TWO_ID),
    ])
    .bind(vec![uuid(MANAGER_ONE_USER_ID), uuid(CASHIER_ONE_USER_ID)])
    .execute(db)
    .await?;

    sqlx::query("delete from stock_movements where product_id = any($1)")
        .bind(vec![
            uuid(PRODUCT_ONE_ID),
            uuid(PRODUCT_TWO_ID),
            uuid(PRODUCT_THREE_ID),
            uuid(STOCK_PRODUCT_SCOPE_ID),
            uuid(STOCK_PRODUCT_BLOCK_ID),
        ])
        .execute(db)
        .await?;
    sqlx::query("delete from transaction_lines where transaction_id = any($1)")
        .bind(vec![
            uuid(TRANSACTION_ONE_ID),
            uuid(TRANSACTION_TWO_ID),
            uuid(TRANSACTION_THREE_ID),
            uuid(TRANSACTION_CREATE_ID),
            uuid(STOCK_SALE_TRANSACTION_ID),
            uuid(STOCK_SALE_BLOCKED_TRANSACTION_ID),
        ])
        .execute(db)
        .await?;
    sqlx::query("delete from transactions where id = any($1)")
        .bind(vec![
            uuid(TRANSACTION_ONE_ID),
            uuid(TRANSACTION_TWO_ID),
            uuid(TRANSACTION_THREE_ID),
            uuid(TRANSACTION_CREATE_ID),
            uuid(STOCK_SALE_TRANSACTION_ID),
            uuid(STOCK_SALE_BLOCKED_TRANSACTION_ID),
        ])
        .execute(db)
        .await?;
    sqlx::query("delete from products where id = any($1)")
        .bind(vec![
            uuid(PRODUCT_THREE_ID),
            uuid(PRODUCT_CREATE_ID),
            uuid(STOCK_PRODUCT_SCOPE_ID),
            uuid(STOCK_PRODUCT_BLOCK_ID),
        ])
        .execute(db)
        .await?;
    sqlx::query("delete from business_units where id = $1")
        .bind(uuid(UNIT_THREE_ID))
        .execute(db)
        .await?;
    sqlx::query("delete from businesses where id = $1")
        .bind(uuid(BUSINESS_TWO_ID))
        .execute(db)
        .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_transaction(
    db: &PgPool,
    transaction_id: Uuid,
    account_id: Uuid,
    business_id: Uuid,
    business_unit_id: Uuid,
    recorded_by_user_id: Uuid,
    product_id: Uuid,
    idempotency_key: &str,
    customer_name: &str,
    product_name: &str,
    sku: &str,
    unit_price: f64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into transactions (
          id, business_account_id, business_id, business_unit_id, customer_name,
          payment_method, payment_status, status, outstanding_amount, total_amount,
          recorded_by_user_id, idempotency_key, created_at
        ) values ($1, $2, $3, $4, $5, 'cash', 'paid', 'completed', 0, $6, $7, $8, now())
        "#,
    )
    .bind(transaction_id)
    .bind(account_id)
    .bind(business_id)
    .bind(business_unit_id)
    .bind(customer_name)
    .bind(unit_price)
    .bind(recorded_by_user_id)
    .bind(idempotency_key)
    .execute(db)
    .await?;

    sqlx::query(
        r#"
        insert into transaction_lines (
          transaction_id, product_id, product_name_snapshot, sku_snapshot,
          quantity, unit_price, line_total
        ) values ($1, $2, $3, $4, 1, $5, $5)
        "#,
    )
    .bind(transaction_id)
    .bind(product_id)
    .bind(product_name)
    .bind(sku)
    .bind(unit_price)
    .execute(db)
    .await?;
    Ok(())
}

async fn audit_count_for_actor(db: &PgPool, action: &str, actor_user_id: Uuid) -> i64 {
    sqlx::query_scalar(
        "select count(*) from audit_logs where action = $1 and actor_user_id = $2",
    )
    .bind(action)
    .bind(actor_user_id)
    .fetch_one(db)
    .await
    .expect("audit count")
}

async fn audit_count_for_resource(db: &PgPool, action: &str, resource_id: Uuid) -> i64 {
    sqlx::query_scalar(
        "select count(*) from audit_logs where action = $1 and resource_id = $2",
    )
    .bind(action)
    .bind(resource_id)
    .fetch_one(db)
    .await
    .expect("audit count")
}

async fn audit_exists_for_resource(db: &PgPool, action: &str, resource_id: Uuid) -> bool {
    sqlx::query_scalar(
        "select exists(select 1 from audit_logs where action = $1 and resource_id = $2)",
    )
    .bind(action)
    .bind(resource_id)
    .fetch_one(db)
    .await
    .expect("audit exists")
}

fn product_payload(
    product_id: &str,
    business_id: &str,
    business_unit_id: &str,
    name: &str,
) -> Value {
    json!({
        "id": product_id,
        "businessId": business_id,
        "businessUnitId": business_unit_id,
        "name": name,
        "sku": format!("{product_id}-sku"),
        "category": "Groceries",
        "availableQuantity": 4.0,
        "defaultPrice": 3000.0
    })
}

fn route_keys(value: &Value) -> Vec<String> {
    value["authorized_routes"]
        .as_array()
        .expect("authorized routes")
        .iter()
        .filter_map(|route| route["key"].as_str().map(ToString::to_string))
        .collect()
}

fn transaction_ids_in_rows(value: &Value) -> Vec<String> {
    value["rows"]
        .as_array()
        .expect("rows array")
        .iter()
        .filter_map(|row| row["transaction_id"].as_str().map(ToString::to_string))
        .collect()
}

fn ids(value: &Value) -> Vec<String> {
    value.as_array()
        .expect("array")
        .iter()
        .filter_map(|item| item["id"].as_str().map(ToString::to_string))
        .collect()
}

fn test_config(database_url: String) -> Config {
    Config {
        app_env: "test".to_string(),
        api_host: "127.0.0.1".to_string(),
        api_port: 18080,
        database_url,
        auth_provider: "legacy".to_string(),
        keycloak_issuer_url: None,
        keycloak_client_id: None,
        keycloak_client_secret: None,
        keycloak_audience: None,
        keycloak_role_client_id: None,
        keycloak_allow_email_linking: false,
        jwt_access_secret: TEST_JWT_SECRET.to_string(),
        access_token_minutes: 15,
        refresh_token_days: 30,
        offline_grant_private_key_pem: None,
        offline_grant_days: 7,
        web_origin: "http://localhost:5173".to_string(),
        google_oauth_client_id: None,
        google_oauth_client_secret: None,
        google_oauth_redirect_uri: None,
        microsoft_oauth_client_id: None,
        microsoft_oauth_client_secret: None,
        microsoft_oauth_redirect_uri: None,
        smtp_host: None,
        smtp_port: 587,
        smtp_username: None,
        smtp_password: None,
        smtp_from_email: None,
        smtp_from_name: "Mbam".to_string(),
    }
}

fn test_guard() -> MutexGuard<'static, ()> {
    TEST_MUTEX
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).expect("static uuid")
}
