use chrono::{DateTime, Datelike, Duration, TimeZone, Utc};
use chrono_tz::Tz;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    authentication::{AuthorizationContext, BaselineRole},
    error::ApiError,
};

use super::{
    model::{DashboardLeader, DashboardSummaryResponse, ReportQuery, ReportResponse, ReportSeries},
    repository::{self, ReportScope},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Timeframe {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

struct ReportWindow {
    timeframe: Timeframe,
    timezone: Tz,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
    bucket: &'static str,
}

/// Returns authorized business-revenue aggregation data.
pub async fn business_revenue(
    db: &PgPool,
    authorization: &AuthorizationContext,
    query: ReportQuery,
) -> Result<ReportResponse, ApiError> {
    authorization
        .require_baseline_role(&[BaselineRole::MasterOwner, BaselineRole::BusinessAdmin])?;
    report(db, authorization, query, "business").await
}

/// Returns authorized shop-revenue aggregation data.
pub async fn shop_revenue(
    db: &PgPool,
    authorization: &AuthorizationContext,
    query: ReportQuery,
) -> Result<ReportResponse, ApiError> {
    report(db, authorization, query, "shop").await
}

/// Returns authorized employee-sales aggregation data.
pub async fn employee_sales(
    db: &PgPool,
    authorization: &AuthorizationContext,
    query: ReportQuery,
) -> Result<ReportResponse, ApiError> {
    report(db, authorization, query, "employee").await
}

/// Returns authorized product quantity and revenue aggregation data.
pub async fn product_sales(
    db: &PgPool,
    authorization: &AuthorizationContext,
    query: ReportQuery,
) -> Result<ReportResponse, ApiError> {
    report(db, authorization, query, "product").await
}

/// Returns daily leader cells for the authenticated baseline dashboard.
pub async fn dashboard_summary(
    db: &PgPool,
    authorization: &AuthorizationContext,
    timezone: Option<String>,
) -> Result<DashboardSummaryResponse, ApiError> {
    let query = ReportQuery {
        timeframe: Some("daily".to_string()),
        timezone,
        business_id: None,
        business_unit_id: None,
        employee_id: None,
        product_id: None,
    };
    let window = report_window(&query)?;
    let scope = report_scope(authorization, &window)?;
    let business = if matches!(
        authorization.baseline_role,
        BaselineRole::MasterOwner | BaselineRole::BusinessAdmin
    ) {
        leader(
            repository::business_revenue(db, &scope, None).await?,
            "businesses",
            false,
        )
    } else {
        None
    };
    let shop = leader(
        repository::shop_revenue(db, &scope, None).await?,
        "shops",
        false,
    );
    let employee = if authorization.baseline_role == BaselineRole::Cashier {
        None
    } else {
        leader(
            repository::employee_sales(db, &scope, None).await?,
            "employees",
            false,
        )
    };
    let product = leader(
        repository::product_sales(db, &scope, None).await?,
        "products",
        true,
    );
    Ok(DashboardSummaryResponse {
        business,
        shop,
        employee,
        product,
    })
}

async fn report(
    db: &PgPool,
    authorization: &AuthorizationContext,
    query: ReportQuery,
    dimension: &str,
) -> Result<ReportResponse, ApiError> {
    let window = report_window(&query)?;
    let scope = report_scope(authorization, &window)?;
    let entity_id = selected_entity(dimension, &query);
    validate_requested_scope(authorization, dimension, &query)?;
    let series = match dimension {
        "business" => repository::business_revenue(db, &scope, entity_id).await?,
        "shop" => repository::shop_revenue(db, &scope, entity_id).await?,
        "employee" => repository::employee_sales(db, &scope, entity_id).await?,
        "product" => repository::product_sales(db, &scope, entity_id).await?,
        _ => return Err(ApiError::NotFound),
    };
    Ok(ReportResponse {
        dimension: dimension.to_string(),
        timeframe: timeframe_name(window.timeframe).to_string(),
        timezone: window.timezone.name().to_string(),
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        series,
    })
}

fn report_scope(
    authorization: &AuthorizationContext,
    window: &ReportWindow,
) -> Result<ReportScope, ApiError> {
    authorization.require_permission("report.view")?;
    let business_ids = authorization
        .business_ids_for_permission("report.view")
        .into_iter()
        .collect::<Vec<_>>();
    let business_unit_ids = authorization
        .business_unit_ids_for_permission("report.view")
        .into_iter()
        .collect::<Vec<_>>();
    if business_ids.is_empty() {
        return Err(ApiError::Forbidden);
    }
    let recorded_by_user_id =
        (authorization.baseline_role == BaselineRole::Cashier).then_some(authorization.user_id);
    Ok(ReportScope {
        business_ids,
        business_unit_ids,
        recorded_by_user_id,
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        bucket: window.bucket.to_string(),
        timezone: window.timezone.name().to_string(),
    })
}

fn validate_requested_scope(
    authorization: &AuthorizationContext,
    dimension: &str,
    query: &ReportQuery,
) -> Result<(), ApiError> {
    if let Some(business_id) = query.business_id {
        authorization.require_business("report.view", business_id)?;
    }
    if let Some(unit_id) = query.business_unit_id {
        authorization.require_business_unit("report.view", unit_id)?;
    }
    if dimension == "employee"
        && authorization.baseline_role == BaselineRole::Cashier
        && query
            .employee_id
            .is_some_and(|id| id != authorization.user_id)
    {
        return Err(ApiError::NotFound);
    }
    Ok(())
}

fn selected_entity(dimension: &str, query: &ReportQuery) -> Option<Uuid> {
    match dimension {
        "business" => query.business_id,
        "shop" => query.business_unit_id,
        "employee" => query.employee_id,
        "product" => query.product_id,
        _ => None,
    }
}

fn report_window(query: &ReportQuery) -> Result<ReportWindow, ApiError> {
    let timeframe = parse_timeframe(query.timeframe.as_deref())?;
    let timezone = query
        .timezone
        .as_deref()
        .unwrap_or("UTC")
        .parse::<Tz>()
        .map_err(|_| ApiError::BadRequest("timezone is invalid".to_string()))?;
    build_window(timeframe, timezone, Utc::now())
}

fn build_window(
    timeframe: Timeframe,
    timezone: Tz,
    now: DateTime<Utc>,
) -> Result<ReportWindow, ApiError> {
    let local = now.with_timezone(&timezone);
    let date = local.date_naive();
    let start_date = match timeframe {
        Timeframe::Daily => date,
        Timeframe::Weekly => date - Duration::days(date.weekday().num_days_from_monday() as i64),
        Timeframe::Monthly => date.with_day(1).expect("day one is valid"),
        Timeframe::Yearly => date
            .with_month(1)
            .and_then(|value| value.with_day(1))
            .expect("year start is valid"),
    };
    let end_date = match timeframe {
        Timeframe::Daily => start_date + Duration::days(1),
        Timeframe::Weekly => start_date + Duration::days(7),
        Timeframe::Monthly => {
            let (year, month) = if start_date.month() == 12 {
                (start_date.year() + 1, 1)
            } else {
                (start_date.year(), start_date.month() + 1)
            };
            chrono::NaiveDate::from_ymd_opt(year, month, 1).expect("next month is valid")
        }
        Timeframe::Yearly => chrono::NaiveDate::from_ymd_opt(start_date.year() + 1, 1, 1)
            .expect("next year is valid"),
    };
    let starts_at = timezone
        .from_local_datetime(&start_date.and_hms_opt(0, 0, 0).expect("midnight is valid"))
        .earliest()
        .ok_or_else(|| ApiError::BadRequest("timeframe start is invalid".to_string()))?
        .with_timezone(&Utc);
    let ends_at = timezone
        .from_local_datetime(&end_date.and_hms_opt(0, 0, 0).expect("midnight is valid"))
        .latest()
        .ok_or_else(|| ApiError::BadRequest("timeframe end is invalid".to_string()))?
        .with_timezone(&Utc);
    Ok(ReportWindow {
        timeframe,
        timezone,
        starts_at,
        ends_at,
        bucket: match timeframe {
            Timeframe::Daily => "hour",
            Timeframe::Weekly | Timeframe::Monthly => "day",
            Timeframe::Yearly => "month",
        },
    })
}

fn parse_timeframe(value: Option<&str>) -> Result<Timeframe, ApiError> {
    match value.unwrap_or("daily") {
        "daily" => Ok(Timeframe::Daily),
        "weekly" => Ok(Timeframe::Weekly),
        "monthly" => Ok(Timeframe::Monthly),
        "yearly" => Ok(Timeframe::Yearly),
        _ => Err(ApiError::BadRequest("timeframe is invalid".to_string())),
    }
}

fn timeframe_name(value: Timeframe) -> &'static str {
    match value {
        Timeframe::Daily => "daily",
        Timeframe::Weekly => "weekly",
        Timeframe::Monthly => "monthly",
        Timeframe::Yearly => "yearly",
    }
}

fn leader(
    mut series: Vec<ReportSeries>,
    detail_segment: &str,
    quantity_primary: bool,
) -> Option<DashboardLeader> {
    series.sort_by(|left, right| {
        let left_value = if quantity_primary {
            left.total_quantity
        } else {
            left.total_revenue
        };
        let right_value = if quantity_primary {
            right.total_quantity
        } else {
            right.total_revenue
        };
        right_value.total_cmp(&left_value)
    });
    series.into_iter().next().map(|series| DashboardLeader {
        entity_id: series.entity_id,
        entity_name: series.entity_name,
        primary_value: if quantity_primary {
            series.total_quantity
        } else {
            series.total_revenue
        },
        secondary_value: if quantity_primary {
            series.total_revenue
        } else {
            series.transaction_count as f64
        },
        detail_path: format!("/{detail_segment}?selected={}", series.entity_id),
        points: series.points,
    })
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use chrono_tz::America::New_York;

    use super::{build_window, Timeframe};

    #[test]
    fn daily_window_respects_timezone_boundary() {
        let now = Utc.with_ymd_and_hms(2026, 3, 8, 7, 30, 0).unwrap();
        let window = build_window(Timeframe::Daily, New_York, now).expect("window");
        assert_eq!(
            window.starts_at,
            Utc.with_ymd_and_hms(2026, 3, 8, 5, 0, 0).unwrap()
        );
        assert_eq!(
            window.ends_at,
            Utc.with_ymd_and_hms(2026, 3, 9, 4, 0, 0).unwrap()
        );
    }

    #[test]
    fn yearly_window_uses_month_buckets() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 0, 0, 0).unwrap();
        let window = build_window(Timeframe::Yearly, chrono_tz::UTC, now).expect("window");
        assert_eq!(window.bucket, "month");
        assert_eq!(
            window.starts_at,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
        );
        assert_eq!(
            window.ends_at,
            Utc.with_ymd_and_hms(2027, 1, 1, 0, 0, 0).unwrap()
        );
    }
}
