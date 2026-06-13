import { workspace } from "../../data/mockWorkspace";
import type { CustomerProfile, TeamMember } from "../../types/workspace";
import type { LocalCustomerRecord, LocalTransactionRecord } from "../localSync/localSyncStore";
import { isOfflineVaultUnlocked } from "../offlineVaultService";
import { listLocalTransactions } from "../transactions/transactionLocalRepository";
import {
  deleteLocalCustomers,
  listLocalCustomers,
  localCustomerToProfile,
  upsertLocalCustomer,
  upsertLocalCustomers,
  type CreateLocalCustomerInput,
} from "./customerLocalRepository";

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function getTransactionsAllowedForMember(member: TeamMember) {
  return workspace.transactions.filter((transaction) => {
    if (member.scopeLevel === "master") return true;
    if (member.scopeLevel === "business") return transaction.businessId === member.businessId;
    if (member.roleId === "role-cashier") return transaction.recordedBy === member.fullName;
    return transaction.businessUnitId === member.businessUnitId;
  });
}

function getPendingPaymentsAllowedForMember(member: TeamMember) {
  return workspace.pendingPayments.filter((payment) => {
    if (member.scopeLevel === "master") return true;
    if (member.scopeLevel === "business") return payment.businessId === member.businessId;
    if (member.roleId === "role-cashier") return payment.recordedBy === member.fullName;
    return payment.businessUnitId === member.businessUnitId;
  });
}

function customerAllowedForMember(customer: LocalCustomerRecord, member: TeamMember): boolean {
  if (member.scopeLevel === "master") return true;

  if (member.roleId === "role-cashier") {
    return customer.attendedByNames.includes(member.fullName) || customer.attendedByUserIds.includes(member.id);
  }

  if (member.scopeLevel === "business") {
    return customer.businessId === member.businessId;
  }

  return Boolean(member.businessUnitId && customer.businessUnitIds.includes(member.businessUnitId));
}

async function getLocalTransactionsAllowedForMember(member: TeamMember): Promise<LocalTransactionRecord[]> {
  if (member.scopeLevel === "master") return listLocalTransactions();
  if (member.scopeLevel === "business") return listLocalTransactions({ businessId: member.businessId });
  if (member.roleId === "role-cashier") return listLocalTransactions({ recordedBy: member.fullName });
  return listLocalTransactions({ businessUnitId: member.businessUnitId });
}

function workspaceCustomerToInput(customer: CustomerProfile, member: TeamMember): CreateLocalCustomerInput {
  const allowedTransactions = getTransactionsAllowedForMember(member).filter((transaction) => transaction.customerName === customer.name);
  const allowedPendingPayments = getPendingPaymentsAllowedForMember(member).filter((payment) => payment.customerId === customer.id);
  const businessUnitIds = uniqueValues([
    ...allowedTransactions.map((transaction) => transaction.businessUnitId),
    ...allowedPendingPayments.map((payment) => payment.businessUnitId),
  ]);
  const attendedByNames = uniqueValues([
    ...allowedTransactions.map((transaction) => transaction.recordedBy),
    ...allowedPendingPayments.map((payment) => payment.recordedBy),
  ]);

  return {
    localId: customer.id,
    serverId: customer.id,
    name: customer.name,
    contact: customer.contact,
    businessId: customer.businessId,
    businessUnitIds,
    attendedByNames,
    lastPurchaseAt: customer.lastPurchaseAt,
    lastPaymentAt: customer.lastPaymentAt,
    paymentDate: customer.paymentDate,
    totalSpent: customer.totalSpent,
    pendingBalance: customer.pendingBalance,
    source: "workspace",
    syncStatus: "synced",
  };
}

async function localTransactionCustomerInputs(member: TeamMember): Promise<CreateLocalCustomerInput[]> {
  const transactions = await getLocalTransactionsAllowedForMember(member);

  return transactions.map((transaction) => ({
    localId: transaction.customerId,
    name: transaction.customerName,
    contact: transaction.customerContact,
    businessId: transaction.businessId,
    businessUnitIds: transaction.businessUnitId ? [transaction.businessUnitId] : [],
    attendedByNames: [transaction.recordedBy],
    attendedByUserIds: transaction.recordedByUserId ? [transaction.recordedByUserId] : [],
    lastPurchaseAt: transaction.createdAt,
    totalSpent: transaction.amount,
    pendingBalance: transaction.outstandingAmount ?? 0,
    source: "local",
    syncStatus: transaction.syncStatus === "synced" ? "synced" : "queued",
  }));
}

function getWorkspaceCustomersAllowedForMember(member: TeamMember): CustomerProfile[] {
  if (member.scopeLevel === "master") return workspace.customers;

  if (member.roleId === "role-cashier") {
    const attendedNames = new Set(getTransactionsAllowedForMember(member).map((transaction) => transaction.customerName));
    const attendedPendingIds = new Set(getPendingPaymentsAllowedForMember(member).map((payment) => payment.customerId));
    return workspace.customers.filter((customer) => attendedNames.has(customer.name) || attendedPendingIds.has(customer.id));
  }

  if (member.scopeLevel === "business") {
    return workspace.customers.filter((customer) => customer.businessId === member.businessId);
  }

  const unitCustomerNames = new Set(getTransactionsAllowedForMember(member).map((transaction) => transaction.customerName));
  const unitPendingCustomerIds = new Set(getPendingPaymentsAllowedForMember(member).map((payment) => payment.customerId));
  return workspace.customers.filter((customer) => unitCustomerNames.has(customer.name) || unitPendingCustomerIds.has(customer.id));
}

async function refreshScopedLocalCustomerCache(member: TeamMember): Promise<LocalCustomerRecord[]> {
  const workspaceInputs = getWorkspaceCustomersAllowedForMember(member).map((customer) => workspaceCustomerToInput(customer, member));
  const localInputs = await localTransactionCustomerInputs(member);
  await upsertLocalCustomers([...workspaceInputs, ...localInputs]);

  const allLocalCustomers = await listLocalCustomers();
  const disallowedCachedIds = allLocalCustomers
    .filter((customer) => !customerAllowedForMember(customer, member))
    .map((customer) => customer.localId);

  if (disallowedCachedIds.length > 0) {
    await deleteLocalCustomers(disallowedCachedIds);
  }

  return (await listLocalCustomers()).filter((customer) => customerAllowedForMember(customer, member));
}

export async function listBrowserDbCustomers(member: TeamMember): Promise<CustomerProfile[]> {
  if (!isOfflineVaultUnlocked()) {
    return getWorkspaceCustomersAllowedForMember(member);
  }
  const customers = await refreshScopedLocalCustomerCache(member);
  return customers.map(localCustomerToProfile);
}

export async function upsertBrowserDbCustomerFromTransaction(input: {
  existingCustomerId?: string;
  name: string;
  contact?: string;
  businessId: string;
  businessUnitId?: string;
  member: TeamMember;
}): Promise<CustomerProfile> {
  const customer = await upsertLocalCustomer({
    localId: input.existingCustomerId,
    serverId: input.existingCustomerId,
    name: input.name,
    contact: input.contact,
    businessId: input.businessId,
    businessUnitIds: input.businessUnitId ? [input.businessUnitId] : [],
    attendedByNames: [input.member.fullName],
    attendedByUserIds: [input.member.id],
    lastPurchaseAt: new Date().toISOString(),
    source: "local",
    syncStatus: "queued",
  });

  return localCustomerToProfile(customer);
}
