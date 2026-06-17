import { getCurrentMember, setCurrentMemberId } from "../../security/accessControl";
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

const roleMetricAccess: Record<string, DashboardMetricKey[]> = {
  "role-master-owner": [
    "totalRevenue",
    "businesses",
    "pendingCustomers",
    "transactions",
    "products",
  ],
  "role-business-admin": [
    "businessRevenue",
    "pendingCustomers",
    "transactions",
    "products",
  ],
  "role-shop-manager": [
    "unitRevenue",
    "pendingCustomers",
    "transactions",
    "products",
  ],
  "role-cashier": [
    "ownSales",
    "ownTransactions",
    "pendingCustomers",
  ],
};

const fallbackMetricAccess: DashboardMetricKey[] = ["ownTransactions"];

export function getDashboardMetricsForRole(roleId: string): DashboardMetricKey[] {
  return roleMetricAccess[roleId] ?? fallbackMetricAccess;
}

export function canViewDashboardMetric(member: TeamMember, metricKey: DashboardMetricKey): boolean {
  return getDashboardMetricsForRole(member.roleId).includes(metricKey);
}

export function getStoredDashboardMember(): TeamMember {
  return getCurrentMember();
}

export function saveDashboardMemberId(memberId: string): void {
  setCurrentMemberId(memberId);
}
