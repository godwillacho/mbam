import { getJson } from "./apiClient";

export type ReportTimeframe = "daily" | "weekly" | "monthly" | "yearly";
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
  businessId?: string;
  businessUnitId?: string;
  employeeId?: string;
  productId?: string;
}

function timezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function query(filters: ReportFilters): string {
  const params = new URLSearchParams({
    timeframe: filters.timeframe,
    timezone: filters.timezone ?? timezone(),
  });
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

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const params = new URLSearchParams({ timezone: timezone() });
  return getJson<DashboardSummary>(
    `/api/v1/reports/dashboard-summary?${params.toString()}`,
  );
}
