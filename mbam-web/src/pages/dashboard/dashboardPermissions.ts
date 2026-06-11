import { workspace } from "../../data/mockWorkspace";
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

export const DASHBOARD_MEMBER_STORAGE_KEY = "mbam_dashboard_member_id";

const roleMetricAccess: Record<string, DashboardMetricKey[]> = {
  "role-master-owner": [
    "totalRevenue",
    "businesses",
    "units",
    "queued",
    "team",
    "pendingCustomers",
    "transactions",
    "products",
  ],
  "role-business-admin": [
    "businessRevenue",
    "units",
    "queued",
    "team",
    "pendingCustomers",
    "transactions",
    "products",
  ],
  "role-shop-manager": [
    "unitRevenue",
    "queued",
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

export function getDashboardMetricsForRole(roleId: string): DashboardMetricKey[] {
  return roleMetricAccess[roleId] ?? [];
}

export function canViewDashboardMetric(member: TeamMember, metricKey: DashboardMetricKey): boolean {
  return getDashboardMetricsForRole(member.roleId).includes(metricKey);
}

export function getStoredDashboardMember(): TeamMember {
  const storedMemberId = typeof window === "undefined" ? undefined : localStorage.getItem(DASHBOARD_MEMBER_STORAGE_KEY) ?? undefined;
  return workspace.teamMembers.find((member) => member.id === storedMemberId) ?? workspace.teamMembers[0];
}

export function saveDashboardMemberId(memberId: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(DASHBOARD_MEMBER_STORAGE_KEY, memberId);
  }
}
