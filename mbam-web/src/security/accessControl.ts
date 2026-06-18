import { workspace } from "../data/mockWorkspace";
import { getActiveSession } from "../services/authSessionStore";
import type {
  BusinessUnit,
  PendingPaymentRecord,
  TeamMember,
  TransactionRecord,
} from "../types/workspace";

export type AppRouteKey =
  | "recordTransaction"
  | "transactionDrafts"
  | "transactions"
  | "businesses"
  | "team"
  | "reports"
  | "products";

export const CURRENT_MEMBER_CHANGE_EVENT = "mbam-current-member-change";
let currentMemberId: string | undefined;

const noAccessMember: TeamMember = {
  id: "member-no-access",
  fullName: "No access loaded",
  email: "",
  roleId: "role-no-access",
  roleName: "No access loaded",
  permissions: [],
  scopeLevel: "unit",
  status: "disabled",
};

const routeAccessByRole: Record<string, AppRouteKey[]> = {
  "role-master-owner": [
    "recordTransaction",
    "transactionDrafts",
    "transactions",
    "businesses",
    "team",
    "reports",
    "products",
  ],
  "role-business-admin": [
    "recordTransaction",
    "transactionDrafts",
    "transactions",
    "businesses",
    "team",
    "reports",
    "products",
  ],
  "role-shop-manager": [
    "recordTransaction",
    "transactionDrafts",
    "transactions",
    "reports",
    "products",
  ],
  "role-cashier": [
    "recordTransaction",
    "transactionDrafts",
    "transactions",
    "products",
  ],
};

const productManagementRoles = new Set([
  "role-master-owner",
  "role-business-admin",
  "role-shop-manager",
]);

const routePermission: Record<AppRouteKey, string> = {
  recordTransaction: "screen.record_transaction",
  transactionDrafts: "screen.transaction_drafts",
  transactions: "screen.transactions",
  businesses: "screen.businesses",
  team: "screen.team",
  reports: "screen.reports",
  products: "screen.products",
};

function baselineRoleId(roleId: string): string {
  if (roleId.startsWith("role-custom-member-business-admin-")) return "role-business-admin";
  if (roleId.startsWith("role-custom-member-shop-manager-")) return "role-shop-manager";
  if (roleId.startsWith("role-custom-member-cashier-")) return "role-cashier";
  return roleId;
}

function isValidatedMaster(member: TeamMember): boolean {
  return (
    member.status === "active" &&
    member.scopeLevel === "master" &&
    baselineRoleId(member.roleId) === "role-master-owner"
  );
}

function isCashierBaseline(member: TeamMember): boolean {
  return baselineRoleId(member.roleId) === "role-cashier";
}

export function getCurrentMember(): TeamMember {
  const selectedMember = workspace.teamMembers.find(
    (member) => member.id === currentMemberId,
  );
  if (selectedMember) return selectedMember;

  const sessionEmail = getActiveSession()?.user.email.toLowerCase();
  const sessionMember = sessionEmail
    ? workspace.teamMembers.find(
        (member) => member.email.toLowerCase() === sessionEmail,
      )
    : undefined;
  if (sessionMember) return sessionMember;

  return getActiveSession() ? noAccessMember : workspace.teamMembers[0] ?? noAccessMember;
}

export function setCurrentMemberId(memberId: string): void {
  currentMemberId = memberId;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CURRENT_MEMBER_CHANGE_EVENT));
}

export function canAccessRoute(
  member: TeamMember,
  routeKey: AppRouteKey,
): boolean {
  if (member.authorizedRouteKeys) {
    return member.authorizedRouteKeys.includes(routeKey);
  }
  if (member.permissions) {
    return member.permissions.includes(routePermission[routeKey]);
  }
  if (getActiveSession()) {
    return isValidatedMaster(member) && routeAccessByRole["role-master-owner"].includes(routeKey);
  }
  return (routeAccessByRole[baselineRoleId(member.roleId)] ?? []).includes(routeKey);
}

export function canManageProducts(member: TeamMember): boolean {
  if (member.permissions) {
    return (
      member.permissions.includes("product.create") ||
      member.permissions.includes("product.update")
    );
  }
  if (getActiveSession()) return isValidatedMaster(member);
  return productManagementRoles.has(baselineRoleId(member.roleId));
}

export function getScopedUnits(member: TeamMember): BusinessUnit[] {
  if (member.scopeLevel === "master") return workspace.businessUnits;

  const grantedUnitIds = new Set(member.businessUnitIds ?? []);
  const grantedBusinessIds = new Set(member.businessIds ?? []);
  if (grantedUnitIds.size > 0 || grantedBusinessIds.size > 0) {
    return workspace.businessUnits.filter(
      (unit) =>
        grantedUnitIds.has(unit.id) ||
        grantedBusinessIds.has(unit.businessId),
    );
  }

  if (member.scopeLevel === "business" && member.businessId) {
    return workspace.businessUnits.filter(
      (unit) => unit.businessId === member.businessId,
    );
  }
  if (member.scopeLevel === "unit" && member.businessUnitId) {
    return workspace.businessUnits.filter(
      (unit) => unit.id === member.businessUnitId,
    );
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

  if (isCashierBaseline(member)) {
    return transactions.filter(
      (transaction) => transaction.recordedBy === member.fullName,
    );
  }

  return transactions;
}

export function getScopedPendingPayments(
  member: TeamMember,
): PendingPaymentRecord[] {
  const scopedUnits = getScopedUnits(member);
  const scopedUnitIds = new Set(scopedUnits.map((unit) => unit.id));
  const payments = workspace.pendingPayments.filter((payment) =>
    scopedUnitIds.has(payment.businessUnitId),
  );

  if (isCashierBaseline(member)) {
    return payments.filter((payment) => payment.recordedBy === member.fullName);
  }

  return payments;
}
