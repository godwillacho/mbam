import { getJson } from "./apiClient";

export type ReportTimeframe = "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type ReportDimension = "businesses" | "shops" | "employees" | "products";

export interface ReportPoint {
  bucket_start: string;
  revenue: number;
  quantity: number;
  transaction_count: number;
}

export interface ReportSeries {
  entity_id: string;
  entity_name: string;
  business_id?: string;
  business_unit_id?: string;
  total_revenue: number;
  total_quantity: number;
  transaction_count: number;
  points: ReportPoint[];
}

export interface ReportResponse {
  dimension: string;
  timeframe: ReportTimeframe;
  timezone: string;
  starts_at: string;
  ends_at: string;
  series: ReportSeries[];
}

export interface DashboardLeader {
  entity_id: string;
  entity_name: string;
  primary_value: number;
  secondary_value: number;
  detail_path: string;
  points: ReportPoint[];
}

export interface DashboardSummary {
  business?: DashboardLeader;
  shop?: DashboardLeader;
  employee?: DashboardLeader;
  product?: DashboardLeader;
}

export interface ReportFilters {
  timeframe: ReportTimeframe;
  timezone?: string;
  /** Inclusive `YYYY-MM-DD`, required only when `timeframe` is `"custom"`. */
  startDate?: string;
  /** Inclusive `YYYY-MM-DD`, required only when `timeframe` is `"custom"`. */
  endDate?: string;
  businessId?: string;
  businessUnitId?: string;
  employeeId?: string;
  productId?: string;
}

/**
 * Filters for the raw detail report, distinct from `ReportFilters` because
 * every dimension here accepts *several* entity ids at once (e.g. a
 * hand-picked set of employees), matching mbam-api's `ReportDetailQuery`
 * (comma-separated `business_ids`/`business_unit_ids`/`employee_ids`/
 * `product_ids`). The aggregate charts (`ReportFilters`) remain single
 * per-entity views and are unaffected.
 */
export interface ReportDetailFilters {
  timeframe: ReportTimeframe;
  timezone?: string;
  startDate?: string;
  endDate?: string;
  businessIds?: string[];
  businessUnitIds?: string[];
  employeeIds?: string[];
  productIds?: string[];
}

/** One printable transaction-line row from the raw detail report. */
export interface ReportDetailRow {
  transaction_id: string;
  created_at: string;
  business_id: string;
  business_name: string;
  business_unit_id?: string;
  business_unit_name?: string;
  customer_name: string;
  payment_method: string;
  status: string;
  recorded_by_user_id: string;
  recorded_by: string;
  transaction_total: number;
  line_id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ReportDetailResponse {
  timeframe: ReportTimeframe;
  timezone: string;
  starts_at: string;
  ends_at: string;
  rows: ReportDetailRow[];
  row_count: number;
  truncated: boolean;
}

function timezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function query(filters: ReportFilters): string {
  const params = new URLSearchParams({
    timeframe: filters.timeframe,
    timezone: filters.timezone ?? timezone(),
  });
  if (filters.timeframe === "custom") {
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
  }
  if (filters.businessId) params.set("business_id", filters.businessId);
  if (filters.businessUnitId) {
    params.set("business_unit_id", filters.businessUnitId);
  }
  if (filters.employeeId) params.set("employee_id", filters.employeeId);
  if (filters.productId) params.set("product_id", filters.productId);
  return params.toString();
}

export async function loadReport(
  dimension: ReportDimension,
  filters: ReportFilters,
): Promise<ReportResponse> {
  return getJson<ReportResponse>(
    `/api/v1/reports/${dimension}?${query(filters)}`,
  );
}

function detailQuery(filters: ReportDetailFilters): string {
  const params = new URLSearchParams({
    timeframe: filters.timeframe,
    timezone: filters.timezone ?? timezone(),
  });
  if (filters.timeframe === "custom") {
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
  }
  if (filters.businessIds?.length) {
    params.set("business_ids", filters.businessIds.join(","));
  }
  if (filters.businessUnitIds?.length) {
    params.set("business_unit_ids", filters.businessUnitIds.join(","));
  }
  if (filters.employeeIds?.length) {
    params.set("employee_ids", filters.employeeIds.join(","));
  }
  if (filters.productIds?.length) {
    params.set("product_ids", filters.productIds.join(","));
  }
  return params.toString();
}

/**
 * Loads the raw, printable transaction/line-item detail report. Restricted
 * server-side to Master Owner and Business Admin (see
 * mbam-api's reports::service::transaction_detail) — callers without that
 * baseline role receive a 403 even within their own scope.
 *
 * Unlike `loadReport`, every filter here may carry multiple comma-joined ids
 * so the caller can build one report covering a hand-picked group of
 * businesses/shops/employees/products at once.
 */
export async function loadReportTransactionDetail(
  filters: ReportDetailFilters,
): Promise<ReportDetailResponse> {
  return getJson<ReportDetailResponse>(
    `/api/v1/reports/transactions?${detailQuery(filters)}`,
  );
}

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const params = new URLSearchParams({ timezone: timezone() });
  return getJson<DashboardSummary>(
    `/api/v1/reports/dashboard-summary?${params.toString()}`,
  );
}
