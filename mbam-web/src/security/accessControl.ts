import { workspace } from "../data/mockWorkspace";
import type { BusinessUnit, PendingPaymentRecord, TeamMember, TransactionRecord } from "../types/workspace";
import { DASHBOARD_MEMBER_STORAGE_KEY } from "../pages/dashboard/dashboardPermissions";

export type AppRouteKey = "recordTransaction" | "transactions" | "businesses" | "team" | "reports";

export const CURRENT_MEMBER_CHANGE_EVENT = "mbam-current-member-change";

const routeAccessByRole: Record<string, AppRouteKey[]> = {
  "role-master-owner": ["transactions", "businesses", "team", "reports"],
  "role-business-admin": ["transactions", "businesses", "team", "reports"],
  "role-shop-manager": ["transactions", "reports"],
  "role-cashier": ["recordTransaction", "transactions"],
};

export function getCurrentMember(): TeamMember {
  const storedMemberId = typeof window === "undefined" ? undefined : localStorage.getItem(DASHBOARD_MEMBER_STORAGE_KEY) ?? undefined;
  return workspace.teamMembers.find((member) => member.id === storedMemberId) ?? workspace.teamMembers[0];
}

export function setCurrentMemberId(memberId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DASHBOARD_MEMBER_STORAGE_KEY, memberId);
  window.dispatchEvent(new Event(CURRENT_MEMBER_CHANGE_EVENT));
}

export function canAccessRoute(member: TeamMember, routeKey: AppRouteKey): boolean {
  return (routeAccessByRole[member.roleId] ?? []).includes(routeKey);
}

export function getScopedUnits(member: TeamMember): BusinessUnit[] {
  if (member.scopeLevel === "master") return workspace.businessUnits;
  if (member.scopeLevel === "business" && member.businessId) {
    return workspace.businessUnits.filter((unit) => unit.businessId === member.businessId);
  }
  if (member.scopeLevel === "unit" && member.businessUnitId) {
    return workspace.businessUnits.filter((unit) => unit.id === member.businessUnitId);
  }
  return [];
}

export function getScopedTransactions(member: TeamMember): TransactionRecord[] {
  const scopedUnits = getScopedUnits(member);
  const scopedUnitIds = new Set(scopedUnits.map((unit) => unit.id));
  const transactions = workspace.transactions.filter((transaction) => scopedUnitIds.has(transaction.businessUnitId));

  if (member.roleId === "role-cashier") {
    return transactions.filter((transaction) => transaction.recordedBy === member.fullName);
  }

  return transactions;
}

export function getScopedPendingPayments(member: TeamMember): PendingPaymentRecord[] {
  const scopedUnits = getScopedUnits(member);
  const scopedUnitIds = new Set(scopedUnits.map((unit) => unit.id));
  const payments = workspace.pendingPayments.filter((payment) => scopedUnitIds.has(payment.businessUnitId));

  if (member.roleId === "role-cashier") {
    return payments.filter((payment) => payment.recordedBy === member.fullName);
  }

  return payments;
}
