use sqlx::PgPool;
use uuid::Uuid;

const TEST_ACCOUNT_ID: &str = "10000000-0000-4000-8000-000000000001";
const OBSOLETE_BUSINESS_ID: &str = "10000000-0000-4000-8000-000000000202";
const TEST_MEMBERSHIP_IDS: &[&str] = &[
    "10000000-0000-4000-8000-000000000400",
    "10000000-0000-4000-8000-000000000401",
    "10000000-0000-4000-8000-000000000402",
    "10000000-0000-4000-8000-000000000403",
    "10000000-0000-4000-8000-000000000404",
    "10000000-0000-4000-8000-000000000405",
];

pub async fn cleanup_test_fixture(db: &PgPool) -> Result<(), sqlx::Error> {
    let account_id = uuid(TEST_ACCOUNT_ID);
    let membership_ids = TEST_MEMBERSHIP_IDS
        .iter()
        .map(|value| uuid(value))
        .collect::<Vec<_>>();
    let mut tx = db.begin().await?;

    sqlx::query("delete from membership_business_scopes where membership_id = any($1)")
        .bind(&membership_ids)
        .execute(&mut *tx)
        .await?;
    sqlx::query("delete from membership_business_unit_scopes where membership_id = any($1)")
        .bind(&membership_ids)
        .execute(&mut *tx)
        .await?;

    // Remove only the obsolete deterministic fixture business. Never delete
    // arbitrary development data created by the user.
    sqlx::query(
        "delete from businesses where id = $1 and business_account_id = $2",
    )
    .bind(uuid(OBSOLETE_BUSINESS_ID))
    .bind(account_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await
}

fn uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).expect("static development cleanup UUID must be valid")
}
