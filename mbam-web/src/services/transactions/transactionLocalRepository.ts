import type { PaymentMethod, TransactionStatus } from "../../types/workspace";
import {
  getLocalSyncDb,
  type LocalTransactionLineRecord,
  type LocalTransactionPaymentStatus,
  type LocalTransactionRecord,
  type LocalTransactionSyncStatus,
} from "../localSync/localSyncStore";

export interface CreateLocalTransactionLineInput {
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateLocalTransactionInput {
  reference?: string;
  businessId: string;
  businessUnitId: string;
  customerId?: string;
  customerName: string;
  customerContact?: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: LocalTransactionPaymentStatus;
  status?: TransactionStatus;
  outstandingAmount?: number;
  createdAt?: string;
  recordedBy: string;
  recordedByUserId?: string;
  rolePolicyVersion?: string;
  syncStatus?: LocalTransactionSyncStatus;
  lines: CreateLocalTransactionLineInput[];
}

export interface ListLocalTransactionsFilters {
  businessId?: string;
  businessUnitId?: string;
  customerQuery?: string;
  recordedBy?: string;
  productQuery?: string;
  status?: TransactionStatus;
  syncStatus?: LocalTransactionSyncStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface LocalTransactionWithLines {
  transaction: LocalTransactionRecord;
  lines: LocalTransactionLineRecord[];
}

export interface LocalTransactionInvoice {
  transaction: LocalTransactionRecord;
  lines: LocalTransactionLineRecord[];
  subtotal: number;
  outstandingAmount: number;
  total: number;
}

const LOCAL_REFERENCE_PREFIX = "LOCAL";

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createReference(createdAt: string): string {
  const timestamp = createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${LOCAL_REFERENCE_PREFIX}-${timestamp}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function assertValidLine(line: CreateLocalTransactionLineInput, index: number): void {
  if (!line.productName.trim()) {
    throw new Error(`Transaction line ${index + 1} requires a product name.`);
  }

  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new Error(`Transaction line ${index + 1} requires a quantity greater than zero.`);
  }

  if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
    throw new Error(`Transaction line ${index + 1} requires a valid unit price.`);
  }
}

function buildLineRecords(transactionLocalId: string, lines: CreateLocalTransactionLineInput[], createdAt: string): LocalTransactionLineRecord[] {
  return lines.map((line, index) => {
    assertValidLine(line, index);
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);

    return {
      localLineId: createId("line"),
      transactionLocalId,
      productId: line.productId,
      productNameSnapshot: line.productName.trim(),
      skuSnapshot: line.sku?.trim() || undefined,
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
      createdAt,
    };
  });
}

function getLineSummary(lines: LocalTransactionLineRecord[]): { amount: number; itemCount: number } {
  return lines.reduce(
    (summary, line) => ({
      amount: summary.amount + line.lineTotal,
      itemCount: summary.itemCount + line.quantity,
    }),
    { amount: 0, itemCount: 0 },
  );
}

function matchesText(value: string | undefined, query: string): boolean {
  return normalizeSearch(value ?? "").includes(query);
}

export async function createLocalTransaction(input: CreateLocalTransactionInput): Promise<LocalTransactionWithLines> {
  if (!input.customerName.trim()) {
    throw new Error("Transaction requires a customer name.");
  }

  if (input.lines.length === 0) {
    throw new Error("Transaction requires at least one product line.");
  }

  const db = await getLocalSyncDb();
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const localId = createId("txn");
  const lines = buildLineRecords(localId, input.lines, createdAt);
  const { amount, itemCount } = getLineSummary(lines);
  const outstandingAmount = Math.max(input.outstandingAmount ?? 0, 0);
  const paymentStatus = input.paymentStatus ?? (outstandingAmount > 0 ? "pending" : "paid");
  const transaction: LocalTransactionRecord = {
    localId,
    reference: input.reference ?? createReference(createdAt),
    businessId: input.businessId,
    businessUnitId: input.businessUnitId,
    customerId: input.customerId,
    customerName: input.customerName.trim(),
    customerContact: input.customerContact?.trim() || undefined,
    itemCount,
    amount,
    outstandingAmount,
    paymentMethod: input.paymentMethod,
    paymentStatus,
    status: input.status ?? "queued",
    createdAt,
    updatedAt: now,
    recordedBy: input.recordedBy,
    recordedByUserId: input.recordedByUserId,
    syncStatus: input.syncStatus ?? "queued",
    idempotencyKey: createId("idem"),
    rolePolicyVersion: input.rolePolicyVersion,
  };

  const tx = db.transaction(["transactions", "transactionLines"], "readwrite");
  await tx.objectStore("transactions").put(transaction);
  await Promise.all(lines.map((line) => tx.objectStore("transactionLines").put(line)));
  await tx.done;

  return { transaction, lines };
}

export async function listLocalTransactions(filters: ListLocalTransactionsFilters = {}): Promise<LocalTransactionRecord[]> {
  const db = await getLocalSyncDb();
  const transactions = await db.getAll("transactions");
  const productQuery = filters.productQuery ? normalizeSearch(filters.productQuery) : "";
  let productMatchedTransactionIds: Set<string> | undefined;

  if (productQuery) {
    const lines = await db.getAll("transactionLines");
    productMatchedTransactionIds = new Set(
      lines
        .filter((line) => matchesText(line.productNameSnapshot, productQuery) || matchesText(line.skuSnapshot, productQuery))
        .map((line) => line.transactionLocalId),
    );
  }

  return transactions
    .filter((transaction) => {
      if (filters.businessId && transaction.businessId !== filters.businessId) return false;
      if (filters.businessUnitId && transaction.businessUnitId !== filters.businessUnitId) return false;
      if (filters.status && transaction.status !== filters.status) return false;
      if (filters.syncStatus && transaction.syncStatus !== filters.syncStatus) return false;
      if (filters.recordedBy && transaction.recordedBy !== filters.recordedBy) return false;
      if (filters.customerQuery && !matchesText(transaction.customerName, normalizeSearch(filters.customerQuery))) return false;
      if (filters.dateFrom && transaction.createdAt < filters.dateFrom) return false;
      if (filters.dateTo && transaction.createdAt > filters.dateTo) return false;
      if (productMatchedTransactionIds && !productMatchedTransactionIds.has(transaction.localId)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLocalTransaction(localId: string): Promise<LocalTransactionRecord | undefined> {
  const db = await getLocalSyncDb();
  return db.get("transactions", localId);
}

export async function getLocalTransactionLines(localId: string): Promise<LocalTransactionLineRecord[]> {
  const db = await getLocalSyncDb();
  return db.getAllFromIndex("transactionLines", "by-transaction-local-id", localId);
}

export async function getLocalTransactionWithLines(localId: string): Promise<LocalTransactionWithLines | undefined> {
  const transaction = await getLocalTransaction(localId);
  if (!transaction) return undefined;

  return {
    transaction,
    lines: await getLocalTransactionLines(localId),
  };
}

export async function updateLocalTransaction(
  localId: string,
  updates: Partial<Omit<LocalTransactionRecord, "localId" | "createdAt" | "idempotencyKey">>,
): Promise<LocalTransactionRecord> {
  const db = await getLocalSyncDb();
  const existing = await db.get("transactions", localId);
  if (!existing) throw new Error("Local transaction was not found.");

  const next: LocalTransactionRecord = {
    ...existing,
    ...updates,
    localId: existing.localId,
    createdAt: existing.createdAt,
    idempotencyKey: existing.idempotencyKey,
    updatedAt: new Date().toISOString(),
  };

  await db.put("transactions", next);
  return next;
}

export async function replaceLocalTransactionLines(localId: string, lines: CreateLocalTransactionLineInput[]): Promise<LocalTransactionWithLines> {
  const db = await getLocalSyncDb();
  const existing = await db.get("transactions", localId);
  if (!existing) throw new Error("Local transaction was not found.");

  const now = new Date().toISOString();
  const existingLines = await db.getAllFromIndex("transactionLines", "by-transaction-local-id", localId);
  const nextLines = buildLineRecords(localId, lines, existing.createdAt);
  const summary = getLineSummary(nextLines);
  const nextTransaction: LocalTransactionRecord = {
    ...existing,
    amount: summary.amount,
    itemCount: summary.itemCount,
    updatedAt: now,
    syncStatus: existing.syncStatus === "synced" ? "queued" : existing.syncStatus,
  };

  const tx = db.transaction(["transactions", "transactionLines"], "readwrite");
  await Promise.all(existingLines.map((line) => tx.objectStore("transactionLines").delete(line.localLineId)));
  await Promise.all(nextLines.map((line) => tx.objectStore("transactionLines").put(line)));
  await tx.objectStore("transactions").put(nextTransaction);
  await tx.done;

  return { transaction: nextTransaction, lines: nextLines };
}

export async function deleteLocalTransaction(localId: string): Promise<void> {
  const db = await getLocalSyncDb();
  const lines = await db.getAllFromIndex("transactionLines", "by-transaction-local-id", localId);
  const tx = db.transaction(["transactions", "transactionLines"], "readwrite");
  await Promise.all(lines.map((line) => tx.objectStore("transactionLines").delete(line.localLineId)));
  await tx.objectStore("transactions").delete(localId);
  await tx.done;
}

export async function markLocalTransactionSyncing(localId: string): Promise<LocalTransactionRecord> {
  return updateLocalTransaction(localId, { syncStatus: "syncing", syncError: undefined });
}

export async function markLocalTransactionSynced(localId: string, serverId: string, serverReference?: string): Promise<LocalTransactionRecord> {
  return updateLocalTransaction(localId, {
    serverId,
    reference: serverReference,
    syncStatus: "synced",
    status: "completed",
    syncError: undefined,
  });
}

export async function markLocalTransactionFailed(localId: string, syncError: string): Promise<LocalTransactionRecord> {
  return updateLocalTransaction(localId, { syncStatus: "failed", syncError });
}

export async function markLocalTransactionRejected(localId: string, syncError: string): Promise<LocalTransactionRecord> {
  return updateLocalTransaction(localId, { syncStatus: "rejected", syncError });
}

export async function getLocalTransactionInvoice(localId: string): Promise<LocalTransactionInvoice | undefined> {
  const transactionWithLines = await getLocalTransactionWithLines(localId);
  if (!transactionWithLines) return undefined;

  const subtotal = transactionWithLines.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const outstandingAmount = transactionWithLines.transaction.outstandingAmount ?? 0;

  return {
    ...transactionWithLines,
    subtotal,
    outstandingAmount,
    total: subtotal,
  };
}
