import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import type { ProductProfile, TeamMember, TransactionRecord } from "../../types/workspace";
import { getProductSearchText } from "../../utils/productDisplay";
import type { LocalTransactionLineRecord, LocalTransactionRecord } from "../localSync/localSyncStore";
import { getLocalTransactionLines, listLocalTransactions } from "./transactionLocalRepository";

export interface TransactionBrowserRow extends TransactionRecord {
  customerContact?: string;
  productsLabel: string;
  productSearchText: string;
  source: "local" | "workspace";
  serverId?: string;
  syncStatus?: LocalTransactionRecord["syncStatus"];
}

function isProductProfile(product: ProductProfile | undefined): product is ProductProfile {
  return Boolean(product);
}

function getMockProducts(transactionId: string): ProductProfile[] {
  return productSales
    .filter((sale) => sale.transactionId === transactionId)
    .map((sale) => workspace.products.find((product) => product.id === sale.productId))
    .filter(isProductProfile);
}

function getMockProductsLabel(transactionId: string): string {
  const products = getMockProducts(transactionId);
  return products.length > 0 ? products.map((product) => product.name).join(", ") : "—";
}

function getMockProductSearchText(transactionId: string): string {
  return getMockProducts(transactionId).map((product) => getProductSearchText(product)).join(" ");
}

function getCustomerContactByName(customerName: string): string | undefined {
  return workspace.customers.find((customer) => customer.name.toLowerCase() === customerName.toLowerCase())?.contact;
}

function localLinesToProductsLabel(lines: LocalTransactionLineRecord[]): string {
  return lines.length > 0 ? lines.map((line) => line.productNameSnapshot).join(", ") : "—";
}

function localLinesToProductSearchText(lines: LocalTransactionLineRecord[]): string {
  return lines.map((line) => [line.productNameSnapshot, line.skuSnapshot].filter(Boolean).join(" ")).join(" ");
}

function getScopedLocalFilters(currentMember: TeamMember) {
  if (currentMember.scopeLevel === "unit") {
    return {
      businessUnitId: currentMember.businessUnitId,
      recordedBy: currentMember.roleId === "role-cashier" ? currentMember.fullName : undefined,
    };
  }

  if (currentMember.scopeLevel === "business") {
    return { businessId: currentMember.businessId };
  }

  return {};
}

function workspaceTransactionToRow(transaction: TransactionRecord): TransactionBrowserRow {
  return {
    ...transaction,
    customerContact: getCustomerContactByName(transaction.customerName),
    productsLabel: getMockProductsLabel(transaction.id),
    productSearchText: getMockProductSearchText(transaction.id),
    source: "workspace",
  };
}

function localTransactionToRow(transaction: LocalTransactionRecord, lines: LocalTransactionLineRecord[]): TransactionBrowserRow {
  return {
    id: transaction.localId,
    serverId: transaction.serverId,
    reference: transaction.reference,
    businessId: transaction.businessId,
    businessUnitId: transaction.businessUnitId,
    customerName: transaction.customerName,
    customerContact: transaction.customerContact,
    itemCount: transaction.itemCount,
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod,
    status: transaction.status,
    createdAt: transaction.createdAt,
    recordedBy: transaction.recordedBy,
    productsLabel: localLinesToProductsLabel(lines),
    productSearchText: localLinesToProductSearchText(lines),
    source: "local",
    syncStatus: transaction.syncStatus,
  };
}

export async function listBrowserDbTransactions(currentMember: TeamMember, workspaceTransactions: TransactionRecord[]): Promise<TransactionBrowserRow[]> {
  const localRecords = await listLocalTransactions(getScopedLocalFilters(currentMember));
  const localRows = await Promise.all(localRecords.map(async (transaction) => {
    const lines = await getLocalTransactionLines(transaction.localId);
    return localTransactionToRow(transaction, lines);
  }));
  const workspaceRows = workspaceTransactions.map(workspaceTransactionToRow);
  const workspaceIds = new Set(workspaceRows.map((transaction) => transaction.id));
  const localOnlyRows = localRows.filter((transaction) => !transaction.serverId || !workspaceIds.has(transaction.serverId));

  return [...localOnlyRows, ...workspaceRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
