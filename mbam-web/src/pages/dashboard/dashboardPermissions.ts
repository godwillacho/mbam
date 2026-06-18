import { getCurrentMember } from "../../security/accessControl";
import type { TeamMember } from "../../types/workspace";

export type DashboardMetricKey =
  | "totalRevenue"
  | "businesses"
  | "units"
  | "queued"
  | "team"
  | "pendingCustomers"
  | "businessRevenue"
  | "unitRevenue"
  | "transactions"
  | "ownSales"
  | "ownTransactions"
  | "products";

export type DashboardView = "master" | "business" | "shop" | "personal" | "custom";

const baselineMetricAccess: Record<DashboardView, DashboardMetricKey[]> = {
  master: ["totalRevenue", "businesses", "units", "pendingCustomers", "transactions", "products"],
  business: ["businessRevenue", "units", "pendingCustomers", "transactions", "products"],
  shop: ["unitRevenue", "queued", "pendingCustomers", "transactions", "products"],
  personal: ["ownSales", "ownTransactions", "products"],
  custom: [],
};

const metricPermissionClauses: Record<DashboardMetricKey, string[]> = {
  totalRevenue: ["report.view", "report.profit.view", "screen.reports"],
  businesses: ["business.view", "screen.businesses"],
  units: ["unit.view", "screen.businesses"],
  queued: ["sale.view", "screen.transactions"],
  team: ["worker.view", "screen.team"],
  pendingCustomers: ["sale.view", "screen.transactions"],
  businessRevenue: ["report.view", "report.profit.view", "screen.reports"],
  unitRevenue: ["report.view", "screen.reports"],
  transactions: ["sale.view", "screen.transactions"],
  ownSales: ["sale.view", "sale.create", "screen.record_transaction", "screen.transactions"],
  ownTransactions: ["sale.view", "screen.transactions"],
  products: ["product.view", "screen.products"],
};

function customBaselineView(roleId: string): DashboardView | null {
  if (roleId.startsWith("role-custom-member-business-admin-")) return "business";
  if (roleId.startsWith("role-custom-member-shop-manager-")) return "shop";
  if (roleId.startsWith("role-custom-member-cashier-")) return "personal";
  return null;
}

function roleBaselineView(member: TeamMember): DashboardView {
  const customBaseline = customBaselineView(member.roleId);
  if (customBaseline) return customBaseline;
  if (member.roleId === "role-master-owner" || member.scopeLevel === "master") return "master";
  if (member.roleId === "role-business-admin" || member.scopeLevel === "business") return "business";
  if (member.roleId === "role-shop-manager") return "shop";
  if (member.roleId === "role-cashier") return "personal";
  return "custom";
}

function isValidatedMaster(member: TeamMember): boolean {
  return member.status === "active" && member.scopeLevel === "master" && member.roleId === "role-master-owner";
}

function hasPermission(member: TeamMember, permission: string): boolean {
  return member.permissions?.includes(permission) === true;
}

function permissionAllows(member: TeamMember, metricKey: DashboardMetricKey): boolean {
  if (!member.permissions && isValidatedMaster(member)) return true;
  return metricPermissionClauses[metricKey].some((permission) => hasPermission(member, permission));
}

function canOpenAdditionalView(member: TeamMember, requested: DashboardView): boolean {
  const baseline = roleBaselineView(member);
  if (requested === baseline) return true;
  return baseline === "personal" && requested === "shop" && (
    hasPermission(member, "screen.reports") || hasPermission(member, "report.view") || hasPermission(member, "worker.view")
  );
}

export function normalizeDashboardView(value: string | null, member: TeamMember): DashboardView {
  const baseline = roleBaselineView(member);
  const requested = value === "master" || value === "business" || value === "shop" || value === "personal" || value === "custom"
    ? value
    : baseline;
  return canOpenAdditionalView(member, requested) ? requested : baseline;
}

export function getDashboardMetricsForMember(member: TeamMember, view: DashboardView = roleBaselineView(member)): DashboardMetricKey[] {
  const authorizedView = normalizeDashboardView(view, member);
  const baseline = baselineMetricAccess[authorizedView] ?? [];
  const customMetrics = Object.keys(metricPermissionClauses).filter((metricKey) =>
    permissionAllows(member, metricKey as DashboardMetricKey),
  ) as DashboardMetricKey[];
  const candidates = authorizedView === "custom" ? customMetrics : baseline;
  return candidates.filter((metricKey) => permissionAllows(member, metricKey));
}

export function getDashboardMetricsForRole(roleId: string): DashboardMetricKey[] {
  return baselineMetricAccess[
    customBaselineView(roleId) ??
    (roleId === "role-master-owner" ? "master" : roleId === "role-business-admin" ? "business" : roleId === "role-shop-manager" ? "shop" : roleId === "role-cashier" ? "personal" : "custom")
  ];
}

export function canViewDashboardMetric(member: TeamMember, metricKey: DashboardMetricKey): boolean {
  return getDashboardMetricsForMember(member).includes(metricKey);
}

export function getStoredDashboardMember(): TeamMember {
  return getCurrentMember();
}
