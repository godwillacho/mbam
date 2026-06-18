use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use super::model::{ReportPoint, ReportSeries};

/// Immutable parameters used by reporting aggregation queries.
pub struct ReportScope {
    pub business_ids: Vec<Uuid>,
    pub business_unit_ids: Vec<Uuid>,
    pub recorded_by_user_id: Option<Uuid>,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub bucket: String,
    pub timezone: String,
}

/// Aggregates revenue by authorized business and chart bucket.
///
/// Input contains validated business/unit scope, optional ownership, UTC window,
/// bucket, and timezone; output is one series per business. Database errors are
/// returned to the service. This function assumes scope was produced by the
/// authorization context and does not authenticate the caller.
pub async fn business_revenue(
    db: &PgPool,
    scope: &ReportScope,
    business_id: Option<Uuid>,
) -> Result<Vec<ReportSeries>, sqlx::Error> {
    aggregate(
        db,
        r#"
        select transaction.business_id as entity_id, business.name as entity_name,
          transaction.business_id as business_id, null::uuid as business_unit_id,
          (date_trunc($7, transaction.created_at at time zone $8) at time zone $8) as bucket_start,
          sum(transaction.total_amount)::float8 as revenue,
          0::float8 as quantity,
          count(distinct transaction.id)::bigint as transaction_count
        from transactions transaction
        join businesses business on business.id = transaction.business_id
        where transaction.status <> 'refunded'
          and transaction.created_at >= $1 and transaction.created_at < $2
          and transaction.business_id = any($3)
          and ($4::uuid[] = array[]::uuid[] or transaction.business_unit_id = any($4))
          and ($5::uuid is null or transaction.recorded_by_user_id = $5)
          and ($6::uuid is null or transaction.business_id = $6)
        group by transaction.business_id, business.name, bucket_start
        order by business.name, bucket_start
        "#,
        scope,
        business_id,
    )
    .await
}

/// Aggregates revenue by authorized shop and chart bucket.
pub async fn shop_revenue(
    db: &PgPool,
    scope: &ReportScope,
    business_unit_id: Option<Uuid>,
) -> Result<Vec<ReportSeries>, sqlx::Error> {
    aggregate(
        db,
        r#"
        select transaction.business_unit_id as entity_id, unit.name as entity_name,
          transaction.business_id as business_id,
          transaction.business_unit_id as business_unit_id,
          (date_trunc($7, transaction.created_at at time zone $8) at time zone $8) as bucket_start,
          sum(transaction.total_amount)::float8 as revenue,
          0::float8 as quantity,
          count(distinct transaction.id)::bigint as transaction_count
        from transactions transaction
        join business_units unit on unit.id = transaction.business_unit_id
        where transaction.status <> 'refunded'
          and transaction.created_at >= $1 and transaction.created_at < $2
          and transaction.business_id = any($3)
          and transaction.business_unit_id = any($4)
          and ($5::uuid is null or transaction.recorded_by_user_id = $5)
          and ($6::uuid is null or transaction.business_unit_id = $6)
        group by transaction.business_unit_id, unit.name, transaction.business_id, bucket_start
        order by unit.name, bucket_start
        "#,
        scope,
        business_unit_id,
    )
    .await
}

/// Aggregates revenue by authorized employee and chart bucket.
pub async fn employee_sales(
    db: &PgPool,
    scope: &ReportScope,
    employee_id: Option<Uuid>,
) -> Result<Vec<ReportSeries>, sqlx::Error> {
    aggregate(
        db,
        r#"
        select transaction.recorded_by_user_id as entity_id, recorder.full_name as entity_name,
          transaction.business_id as business_id,
          transaction.business_unit_id as business_unit_id,
          (date_trunc($7, transaction.created_at at time zone $8) at time zone $8) as bucket_start,
          sum(transaction.total_amount)::float8 as revenue,
          0::float8 as quantity,
          count(distinct transaction.id)::bigint as transaction_count
        from transactions transaction
        join users recorder on recorder.id = transaction.recorded_by_user_id
        where transaction.status <> 'refunded'
          and transaction.created_at >= $1 and transaction.created_at < $2
          and transaction.business_id = any($3)
          and ($4::uuid[] = array[]::uuid[] or transaction.business_unit_id = any($4))
          and ($5::uuid is null or transaction.recorded_by_user_id = $5)
          and ($6::uuid is null or transaction.recorded_by_user_id = $6)
        group by transaction.recorded_by_user_id, recorder.full_name,
          transaction.business_id, transaction.business_unit_id, bucket_start
        order by recorder.full_name, bucket_start
        "#,
        scope,
        employee_id,
    )
    .await
}

/// Aggregates sold quantity and revenue by authorized product and chart bucket.
pub async fn product_sales(
    db: &PgPool,
    scope: &ReportScope,
    product_id: Option<Uuid>,
) -> Result<Vec<ReportSeries>, sqlx::Error> {
    aggregate(
        db,
        r#"
        select coalesce(line.product_id, line.id) as entity_id,
          line.product_name_snapshot as entity_name,
          transaction.business_id as business_id,
          transaction.business_unit_id as business_unit_id,
          (date_trunc($7, transaction.created_at at time zone $8) at time zone $8) as bucket_start,
          sum(line.line_total)::float8 as revenue,
          sum(line.quantity)::float8 as quantity,
          count(distinct transaction.id)::bigint as transaction_count
        from transaction_lines line
        join transactions transaction on transaction.id = line.transaction_id
        where transaction.status <> 'refunded'
          and transaction.created_at >= $1 and transaction.created_at < $2
          and transaction.business_id = any($3)
          and ($4::uuid[] = array[]::uuid[] or transaction.business_unit_id = any($4))
          and ($5::uuid is null or transaction.recorded_by_user_id = $5)
          and ($6::uuid is null or line.product_id = $6)
        group by coalesce(line.product_id, line.id), line.product_name_snapshot,
          transaction.business_id, transaction.business_unit_id, bucket_start
        order by line.product_name_snapshot, bucket_start
        "#,
        scope,
        product_id,
    )
    .await
}

async fn aggregate(
    db: &PgPool,
    query: &str,
    scope: &ReportScope,
    entity_id: Option<Uuid>,
) -> Result<Vec<ReportSeries>, sqlx::Error> {
    let rows = sqlx::query(query)
        .bind(scope.starts_at)
        .bind(scope.ends_at)
        .bind(&scope.business_ids)
        .bind(&scope.business_unit_ids)
        .bind(scope.recorded_by_user_id)
        .bind(entity_id)
        .bind(&scope.bucket)
        .bind(&scope.timezone)
        .fetch_all(db)
        .await?;

    let mut series = Vec::<ReportSeries>::new();
    for row in rows {
        let id: Uuid = row.try_get("entity_id")?;
        let point = ReportPoint {
            bucket_start: row.try_get("bucket_start")?,
            revenue: row.try_get("revenue")?,
            quantity: row.try_get("quantity")?,
            transaction_count: row.try_get("transaction_count")?,
        };
        if let Some(existing) = series.iter_mut().find(|item| item.entity_id == id) {
            existing.total_revenue += point.revenue;
            existing.total_quantity += point.quantity;
            existing.transaction_count += point.transaction_count;
            existing.points.push(point);
        } else {
            series.push(ReportSeries {
                entity_id: id,
                entity_name: row.try_get("entity_name")?,
                business_id: row.try_get("business_id")?,
                business_unit_id: row.try_get("business_unit_id")?,
                total_revenue: point.revenue,
                total_quantity: point.quantity,
                transaction_count: point.transaction_count,
                points: vec![point],
            });
        }
    }
    Ok(series)
}
