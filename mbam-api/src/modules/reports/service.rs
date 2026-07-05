use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    authentication::{AuthorizationContext, BaselineRole},
    error::ApiError,
};

use super::{
    model::{
        DashboardLeader, DashboardSummaryResponse, ReportDetailResponse, ReportQuery,
        ReportResponse, ReportSeries,
    },
    repository::{self, DetailFilters, ReportScope},
};

/// Longest span (inclusive) allowed for a custom start/end date range, to
/// keep the aggregation query and any raw-detail export bounded. Two years
/// comfortably covers year-over-year audits without allowing an unbounded
/// full-history scan.
const MAX_CUSTOM_RANGE_DAYS: i64 = 731;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Timeframe {
    Daily,
    Weekly,
    Monthly,
    Yearly,
    Custom,
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

/// Returns the raw, printable transaction/line-item detail report.
///
/// Restricted to Master Owner and Business Admin, on top of the usual
/// `report.view` scope check, so line-item detail (customer names, exact
/// amounts, who recorded each sale) stays limited to the roles who can
/// already see full business-level reporting. Shop Managers and Cashiers
/// keep the existing summary/chart view and cannot reach this endpoint even
/// within their own scope.
pub async fn transaction_detail(
    db: &PgPool,
    authorization: &AuthorizationContext,
    query: ReportQuery,
) -> Result<ReportDetailResponse, ApiError> {
    authorization
        .require_baseline_role(&[BaselineRole::MasterOwner, BaselineRole::BusinessAdmin])?;
    let window = report_window(&query)?;
    let scope = report_scope(authorization, &window)?;

    if let Err(error) =
        validate_requested_business_scope(authorization, query.business_id, query.business_unit_id)
    {
        let _ = crate::modules::audit::record_authorization_event(
            db,
            authorization,
            "authorization.report.denied",
            "transaction_detail",
            None,
            query.business_id,
            query.business_unit_id,
            serde_json::json!({ "reason": "outside_current_scope" }),
        )
        .await;
        return Err(error);
    }

    let filters = DetailFilters {
        business_id: query.business_id,
        business_unit_id: query.business_unit_id,
        employee_id: query.employee_id,
        product_id: query.product_id,
    };
    let (rows, truncated) = repository::transaction_detail(db, &scope, &filters).await?;

    // Fire-and-forget audit trail of who pulled a raw/line-item export and
    // over what window, distinct from the "denied" event above. A failure to
    // record this must not block the caller from receiving their report.
    let _ = crate::modules::audit::record_authorization_event(
        db,
        authorization,
        "report.detail.viewed",
        "transaction_detail",
        None,
        query.business_id,
        query.business_unit_id,
        serde_json::json!({
            "timeframe": timeframe_name(window.timeframe),
            "starts_at": window.starts_at,
            "ends_at": window.ends_at,
            "row_count": rows.len(),
        }),
    )
    .await;

    Ok(ReportDetailResponse {
        timeframe: timeframe_name(window.timeframe).to_string(),
        timezone: window.timezone.name().to_string(),
        starts_at: window.starts_at,
        ends_at: window.ends_at,
        row_count: rows.len() as i64,
        truncated,
        rows,
    })
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
        start_date: None,
        end_date: None,
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
    if let Err(error) = validate_requested_scope(authorization, dimension, &query) {
        let _ = crate::modules::audit::record_authorization_event(
            db,
            authorization,
            "authorization.report.denied",
            dimension,
            selected_entity(dimension, &query),
            query.business_id,
            query.business_unit_id,
            serde_json::json!({ "reason": "outside_current_scope" }),
        )
        .await;
        return Err(error);
    }
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
    validate_requested_business_scope(authorization, query.business_id, query.business_unit_id)?;
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

/// Validates any explicitly requested `business_id`/`business_unit_id`
/// against the caller's own grants. Mirrors the per-dimension checks in
/// `validate_requested_scope` but without a dimension, for endpoints (like
/// the raw detail report) that accept several optional filters at once
/// rather than aggregating by a single dimension.
fn validate_requested_business_scope(
    authorization: &AuthorizationContext,
    business_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
) -> Result<(), ApiError> {
    if let Some(business_id) = business_id {
        authorization.require_business("report.view", business_id)?;
    }
    if let Some(unit_id) = business_unit_id {
        authorization.require_business_unit("report.view", unit_id)?;
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
    let custom_range = if timeframe == Timeframe::Custom {
        Some(parse_custom_range(
            query.start_date.as_deref(),
            query.end_date.as_deref(),
        )?)
    } else {
        None
    };
    build_window(timeframe, timezone, Utc::now(), custom_range)
}

/// Parses the caller-supplied inclusive `YYYY-MM-DD` custom range.
///
/// Input is the raw `start_date`/`end_date` query strings; output is a valid
/// `(start, end)` `NaiveDate` pair with `end >= start`. Malformed dates,
/// missing fields, an inverted range, or a range longer than
/// `MAX_CUSTOM_RANGE_DAYS` all return `400`. This function does not apply a
/// timezone or authorize the request.
fn parse_custom_range(
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<(NaiveDate, NaiveDate), ApiError> {
    let start_date = start_date.ok_or_else(|| {
        ApiError::BadRequest("start_date is required for a custom timeframe".to_string())
    })?;
    let end_date = end_date.ok_or_else(|| {
        ApiError::BadRequest("end_date is required for a custom timeframe".to_string())
    })?;
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|_| ApiError::BadRequest("start_date must be in YYYY-MM-DD format".to_string()))?;
    let end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
        .map_err(|_| ApiError::BadRequest("end_date must be in YYYY-MM-DD format".to_string()))?;
    if end < start {
        return Err(ApiError::BadRequest(
            "end_date must not be before start_date".to_string(),
        ));
    }
    if (end - start).num_days() + 1 > MAX_CUSTOM_RANGE_DAYS {
        return Err(ApiError::BadRequest(format!(
            "custom range cannot exceed {MAX_CUSTOM_RANGE_DAYS} days"
        )));
    }
    Ok((start, end))
}

fn build_window(
    timeframe: Timeframe,
    timezone: Tz,
    now: DateTime<Utc>,
    custom_range: Option<(NaiveDate, NaiveDate)>,
) -> Result<ReportWindow, ApiError> {
    let local = now.with_timezone(&timezone);
    let today = local.date_naive();
    let (start_date, end_date) = match timeframe {
        Timeframe::Daily => (today, today + Duration::days(1)),
        Timeframe::Weekly => {
            let start = today - Duration::days(today.weekday().num_days_from_monday() as i64);
            (start, start + Duration::days(7))
        }
        Timeframe::Monthly => {
            let start = today.with_day(1).expect("day one is valid");
            let (year, month) = if start.month() == 12 {
                (start.year() + 1, 1)
            } else {
                (start.year(), start.month() + 1)
            };
            (
                start,
                chrono::NaiveDate::from_ymd_opt(year, month, 1).expect("next month is valid"),
            )
        }
        Timeframe::Yearly => {
            let start = today
                .with_month(1)
                .and_then(|value| value.with_day(1))
                .expect("year start is valid");
            (
                start,
                chrono::NaiveDate::from_ymd_opt(start.year() + 1, 1, 1)
                    .expect("next year is valid"),
            )
        }
        Timeframe::Custom => {
            let (start, end) = custom_range.expect("custom_range validated by report_window");
            // The caller's end_date is inclusive; the window's upper bound is
            // exclusive, so the day after end_date is the correct boundary.
            (start, end + Duration::days(1))
        }
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
    let bucket = match timeframe {
        Timeframe::Daily => "hour",
        Timeframe::Weekly | Timeframe::Monthly => "day",
        Timeframe::Yearly => "month",
        // A custom range can be anything from a single day to two years, so
        // pick a bucket granularity that keeps the resulting chart readable
        // instead of anchoring to a fixed preset's bucket.
        Timeframe::Custom => {
            let span_days = (end_date - start_date).num_days();
            if span_days <= 2 {
                "hour"
            } else if span_days <= 186 {
                "day"
            } else {
                "month"
            }
        }
    };
    Ok(ReportWindow {
        timeframe,
        timezone,
        starts_at,
        ends_at,
        bucket,
    })
}

fn parse_timeframe(value: Option<&str>) -> Result<Timeframe, ApiError> {
    match value.unwrap_or("daily") {
        "daily" => Ok(Timeframe::Daily),
        "weekly" => Ok(Timeframe::Weekly),
        "monthly" => Ok(Timeframe::Monthly),
        "yearly" => Ok(Timeframe::Yearly),
        "custom" => Ok(Timeframe::Custom),
        _ => Err(ApiError::BadRequest("timeframe is invalid".to_string())),
    }
}

fn timeframe_name(value: Timeframe) -> &'static str {
    match value {
        Timeframe::Daily => "daily",
        Timeframe::Weekly => "weekly",
        Timeframe::Monthly => "monthly",
        Timeframe::Yearly => "yearly",
        Timeframe::Custom => "custom",
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
    series.into_iter().next().map(|series| {
        // Shops, employees, and products each have a dedicated per-entity
        // report route (e.g. `/shops/:entityId`). Businesses do not have an
        // equivalent per-entity page yet, so keep pointing at the plain
        // businesses list for that one segment.
        let detail_path = if detail_segment == "businesses" {
            format!("/{detail_segment}?selected={}", series.entity_id)
        } else {
            format!("/{detail_segment}/{}", series.entity_id)
        };
        DashboardLeader {
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
            detail_path,
            points: series.points,
        }
    })
}

#[cfg(test)]
mod tests {
    use chrono::{NaiveDate, TimeZone, Utc};
    use chrono_tz::America::New_York;

    use super::{build_window, parse_custom_range, Timeframe, MAX_CUSTOM_RANGE_DAYS};

    #[test]
    fn daily_window_respects_timezone_boundary() {
        let now = Utc.with_ymd_and_hms(2026, 3, 8, 7, 30, 0).unwrap();
        let window = build_window(Timeframe::Daily, New_York, now, None).expect("window");
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
        let window = build_window(Timeframe::Yearly, chrono_tz::UTC, now, None).expect("window");
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

    #[test]
    fn custom_window_treats_end_date_as_inclusive_and_buckets_by_day() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 0, 0, 0).unwrap();
        let start = NaiveDate::from_ymd_opt(2026, 3, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 3, 31).unwrap();
        let window = build_window(Timeframe::Custom, chrono_tz::UTC, now, Some((start, end)))
            .expect("window");
        assert_eq!(window.bucket, "day");
        assert_eq!(
            window.starts_at,
            Utc.with_ymd_and_hms(2026, 3, 1, 0, 0, 0).unwrap()
        );
        // end_date is inclusive, so the exclusive upper bound is one day past it.
        assert_eq!(
            window.ends_at,
            Utc.with_ymd_and_hms(2026, 4, 1, 0, 0, 0).unwrap()
        );
    }

    #[test]
    fn custom_window_buckets_a_long_range_by_month() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 0, 0, 0).unwrap();
        let start = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2025, 12, 31).unwrap();
        let window = build_window(Timeframe::Custom, chrono_tz::UTC, now, Some((start, end)))
            .expect("window");
        assert_eq!(window.bucket, "month");
    }

    #[test]
    fn parse_custom_range_rejects_inverted_or_oversized_ranges() {
        assert!(parse_custom_range(Some("2026-03-10"), Some("2026-03-01")).is_err());
        assert!(parse_custom_range(Some("not-a-date"), Some("2026-03-01")).is_err());
        assert!(parse_custom_range(None, Some("2026-03-01")).is_err());

        let start = NaiveDate::from_ymd_opt(2020, 1, 1).unwrap();
        let end = start + chrono::Duration::days(MAX_CUSTOM_RANGE_DAYS);
        let start_str = start.format("%Y-%m-%d").to_string();
        let end_str = end.format("%Y-%m-%d").to_string();
        assert!(parse_custom_range(Some(&start_str), Some(&end_str)).is_err());

        let end_ok = start + chrono::Duration::days(MAX_CUSTOM_RANGE_DAYS - 1);
        let end_ok_str = end_ok.format("%Y-%m-%d").to_string();
        assert!(parse_custom_range(Some(&start_str), Some(&end_ok_str)).is_ok());
    }
}
