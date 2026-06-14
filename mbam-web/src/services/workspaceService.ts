import {
  updateCloudWorkspace,
  workspace,
} from "../data/mockWorkspace";
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

function toTeamMember(member: TeamEmployee): TeamMember {
  return {
    id: member.id,
    fullName: member.full_name,
    email: member.email,
    roleId: roleId(member.role_code),
    scopeLevel: scopeLevel(member),
    businessId: member.business_id,
    businessUnitId: member.business_unit_id,
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

  const businesses = await listBusinesses();
  const businessUnits = (
    await Promise.all(
      businesses.map((business) => listBusinessUnits(business.id)),
    )
  ).flat();

  const [productResult, cloudTransactions, team] = await Promise.all([
    listProducts([]),
    listCloudTransactions(),
    loadTeamWorkspace(),
  ]);

  const teamMembers = team.members.map(toTeamMember);
  if (!teamMembers.some((member) => member.email === session.user.email)) {
    teamMembers.unshift(workspace.teamMembers[0]);
  }

  updateCloudWorkspace({
    masterAccount: {
      name:
        businesses.length === 1
          ? businesses[0].name
          : `${session.user.fullName}'s workspace`,
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
    roles: team.roles.map((role) => ({
      id: roleId(role.code),
      name: role.name,
      permissions: role.permissions,
    })),
    teamMembers,
    customers: [],
    pendingPayments: [],
  });
}
