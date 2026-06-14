import { workspace } from "../data/mockWorkspace";
import type { BusinessUnit, PendingPaymentRecord, TeamMember, TransactionRecord } from "../types/workspace";

export type AppRouteKey = "recordTransaction" | "transactionDrafts" | "transactions" | "businesses" | "team" | "reports" | "products";

export const CURRENT_MEMBER_CHANGE_EVENT = "mbam-current-member-change";
let currentMemberId = workspace.teamMembers[0]?.id;

const routeAccessByRole: Record<string, AppRouteKey[]> = {
  "role-master-owner": ["recordTransaction", "transactionDrafts", "transactions", "businesses", "team", "reports", "products"],
  "role-business-admin": ["recordTransaction", "transactionDrafts", "transactions", "businesses", "team", "reports", "products"],
  "role-shop-manager": ["recordTransaction", "transactionDrafts", "transactions", "reports", "products"],
  "role-cashier": ["recordTransaction", "transactionDrafts", "transactions", "products"],
};

const productManagementRoles = new Set([
  "role-master-owner",
  "role-business-admin",
  "role-shop-manager",
]);

export function getCurrentMember(): TeamMember {
  return workspace.teamMembers.find((member) => member.id === currentMemberId) ?? workspace.teamMembers[0];
}

export function setCurrentMemberId(memberId: string): void {
  if (typeof window === "undefined") return;
  currentMemberId = memberId;
  window.dispatchEvent(new Event(CURRENT_MEMBER_CHANGE_EVENT));
}

export function canAccessRoute(member: TeamMember, routeKey: AppRouteKey): boolean {
  return (routeAccessByRole[member.roleId] ?? []).includes(routeKey);
}

export function canManageProducts(member: TeamMember): boolean {
  return productManagementRoles.has(member.roleId);
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
  const transactions = workspace.transactions.filter(
    (transaction) =>
      transaction.businessUnitId === undefined ||
      scopedUnitIds.has(transaction.businessUnitId),
  );

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
