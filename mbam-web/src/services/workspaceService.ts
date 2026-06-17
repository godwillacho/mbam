import { updateCloudWorkspace, workspace } from "../data/mockWorkspace";
import { setCurrentMemberId } from "../security/accessControl";
import type {
  PaymentMethod,
  ScopeLevel,
  TeamMember,
  TransactionStatus,
} from "../types/workspace";
import { listBusinesses, listBusinessUnits } from "./businessService";
import { getCurrentSession } from "./authService";
import { listProducts } from "./productService";
import { loadTeamWorkspace, type TeamEmployee } from "./teamService";
import { listCloudTransactions } from "./transactionService";

function roleId(code: string): string {
  return `role-${code.replace(/_/g, "-")}`;
}

function scopeLevel(member: TeamEmployee): ScopeLevel {
  if (member.business_unit_id) return "unit";
  if (member.business_id) return "business";
  return "master";
}

function toTeamMember(
  member: TeamEmployee,
  permissions?: string[],
  grantedBusinessIds?: string[],
  grantedBusinessUnitIds?: string[],
): TeamMember {
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
    status: member.status,
  };
}

function paymentMethod(value: string): PaymentMethod {
  if (
    value === "mobile_money" ||
    value === "card" ||
    value === "bank_transfer"
  ) {
    return value;
  }
  return "cash";
}

function transactionStatus(value: string): TransactionStatus {
  if (value === "queued" || value === "refunded") return value;
  return "completed";
}

export async function hydrateCloudWorkspace(): Promise<void> {
  const session = getCurrentSession();
  if (!session) return;

  const team = await loadTeamWorkspace();
  const sessionEmail = session.user.email.toLowerCase();
  const permissionsByRoleId = new Map(
    team.roles.map((role) => [role.id, role.permissions]),
  );
  const grantedBusinessIds = team.businesses.map((business) => business.id);
  const grantedBusinessUnitIds = team.business_units.map((unit) => unit.id);
  const teamMembers = team.members.map((member) => {
    const isSessionMember = member.email.toLowerCase() === sessionEmail;
    return toTeamMember(
      member,
      permissionsByRoleId.get(member.role_id),
      isSessionMember ? grantedBusinessIds : undefined,
      isSessionMember ? grantedBusinessUnitIds : undefined,
    );
  });
  const sessionMember = teamMembers.find(
    (member) => member.email.toLowerCase() === sessionEmail,
  );

  if (
    !sessionMember &&
    !teamMembers.some((member) => member.email === session.user.email)
  ) {
    teamMembers.unshift(workspace.teamMembers[0]);
  }

  if (sessionMember) {
    setCurrentMemberId(sessionMember.id);
  }

  updateCloudWorkspace({
    roles: team.roles.map((role) => ({
      id: roleId(role.code),
      name: role.name,
      permissions: role.permissions,
    })),
    teamMembers,
  });

  const businesses = await listBusinesses();
  const businessUnits = (
    await Promise.all(
      businesses.map((business) => listBusinessUnits(business.id)),
    )
  ).flat();

  const [productResult, cloudTransactions] = await Promise.all([
    listProducts([]),
    listCloudTransactions(),
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
}
