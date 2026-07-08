import { activateCloudWorkspace, updateCloudWorkspace, workspace } from "../data/mockWorkspace";
import { setCurrentMemberId } from "../routing/accessControl";
import type { PaymentMethod, ScopeLevel, TeamMember, TransactionStatus } from "../types/workspace";
import { listBusinesses, listBusinessUnits } from "./businessService";
import {
  authorizationBootstrapToTeamWorkspace,
  loadAuthorizationBootstrap,
} from "./authorizationService";
import { getCurrentSession } from "./authService";
import { getValidOfflineAuthorizationSnapshot } from "./offlineAuthorizationSnapshotService";
import { listProducts } from "./productService";
import type { TeamEmployee, TeamWorkspace } from "./teamService";
import { listCloudTransactions } from "./transactionService";

function roleId(code: string): string {
  return `role-${code.replace(/_/g, "-")}`;
}

function scopeLevel(member: TeamEmployee): ScopeLevel {
  if (member.business_unit_id) return "unit";
  if (member.business_id) return "business";
  return "master";
}

function toTeamMember(member: TeamEmployee, permissions?: string[], grantedBusinessIds?: string[], grantedBusinessUnitIds?: string[]): TeamMember {
  return {
    id: member.id,
    fullName: member.full_name,
    email: member.email,
    roleId: roleId(member.role_code),
    roleName: member.role_name,
    ...(permissions ? { permissions } : {}),
    scopeLevel: scopeLevel(member),
    businessId: member.business_id,
    businessUnitId: member.business_unit_id,
    ...(grantedBusinessIds ? { businessIds: grantedBusinessIds } : {}),
    ...(grantedBusinessUnitIds ? { businessUnitIds: grantedBusinessUnitIds } : {}),
    ...(member.authorized_route_keys
      ? { authorizedRouteKeys: member.authorized_route_keys }
      : {}),
    status: member.status,
  };
}

function paymentMethod(value: string): PaymentMethod {
  if (value === "mobile_money" || value === "card" || value === "bank_transfer") return value;
  return "cash";
}

function transactionStatus(value: string): TransactionStatus {
  if (value === "queued" || value === "refunded") return value;
  return "completed";
}

function applyTeamAuthorization(
  team: TeamWorkspace,
  sessionUserId: string,
  sessionEmail: string,
): void {
  const permissionsByRoleId = new Map(team.roles.map((role) => [role.id, role.permissions]));
  const grantedBusinessIds = team.businesses.map((business) => business.id);
  const grantedBusinessUnitIds = team.business_units.map((unit) => unit.id);
  const teamMembers = team.members.map((member) => {
    const isSessionMember = member.user_id === sessionUserId;
    return toTeamMember(
      member,
      permissionsByRoleId.get(member.role_id),
      isSessionMember ? grantedBusinessIds : undefined,
      isSessionMember ? grantedBusinessUnitIds : undefined,
    );
  });
  const sessionMember = team.members.find(
    (member) =>
      member.user_id === sessionUserId &&
      member.email.toLowerCase() === sessionEmail,
  );
  if (!sessionMember) throw new Error("authenticated_membership_not_found");
  if (sessionMember.status !== "active") throw new Error("authenticated_membership_inactive");

  updateCloudWorkspace({
    roles: team.roles.map((role) => ({ id: roleId(role.code), name: role.name, permissions: role.permissions })),
    teamMembers,
  });
  setCurrentMemberId(sessionMember.id);
}

async function hydrateOfflineWorkspace(sessionUserId: string): Promise<TeamWorkspace | undefined> {
  const snapshot = await getValidOfflineAuthorizationSnapshot(sessionUserId);
  if (!snapshot) return undefined;
  updateCloudWorkspace(snapshot.workspaceData);
  setCurrentMemberId(snapshot.dashboardProfile.membership_id);
  return snapshot.team;
}

export async function hydrateAuthorizationWorkspace(): Promise<TeamWorkspace | undefined> {
  const session = getCurrentSession();
  if (!session) return undefined;
  if (!session.accessToken) return hydrateOfflineWorkspace(session.user.id);

  // Replace the static demo/mock fixture with a placeholder tied to the real
  // signed-in user before any authenticated data loads. Without this,
  // `workspace.masterAccount.id` would keep the mock fixture's static id
  // forever (`updateCloudWorkspace` below only ever merges `name`/`currency`
  // into `masterAccount`, never `id`), so `isDemoWorkspace()` would remain
  // true for the rest of the session even though the account is real.
  activateCloudWorkspace(session.user);

  const team = authorizationBootstrapToTeamWorkspace(
    await loadAuthorizationBootstrap(),
  );
  applyTeamAuthorization(
    team,
    session.user.id,
    session.user.email.toLowerCase(),
  );
  return team;
}

export async function hydrateCloudWorkspace(authorizedTeam?: TeamWorkspace): Promise<TeamWorkspace | undefined> {
  const session = getCurrentSession();
  if (!session) return undefined;
  const team = authorizedTeam ?? await hydrateAuthorizationWorkspace();
  if (!team) return undefined;

  const businesses = await listBusinesses().catch(() => []);
  const businessUnits = (
    await Promise.all(businesses.map((business) => listBusinessUnits(business.id).catch(() => [])))
  ).flat();
  const [productResult, cloudTransactions] = await Promise.all([
    listProducts([]).catch(() => ({ products: [], source: "fallback" as const })),
    listCloudTransactions().catch(() => []),
  ]);

  updateCloudWorkspace({
    masterAccount: {
      name: businesses.length === 1 ? businesses[0].name : "",
      currency: businesses[0]?.currency ?? workspace.masterAccount.currency,
    },
    businesses,
    businessUnits,
    products: productResult.products,
    transactions: cloudTransactions.map((transaction) => ({
      id: transaction.id,
      reference: transaction.idempotencyKey,
      businessId: transaction.businessId,
      businessUnitId: transaction.businessUnitId,
      customerName: transaction.customerName,
      itemCount: transaction.lines.length,
      amount: transaction.totalAmount,
      paymentMethod: paymentMethod(transaction.paymentMethod),
      status: transactionStatus(transaction.status),
      createdAt: transaction.createdAt,
      recordedBy: transaction.recordedBy,
    })),
    customers: [],
    pendingPayments: [],
  });
  return team;
}
