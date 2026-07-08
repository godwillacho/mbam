import type { PaymentMethod, TransactionStatus } from "../../types/workspace";
import { decryptJson, encryptJson } from "../encryptionService";
import {
  getEncryptedEntitiesByType,
  getEncryptedEntity,
  putEncryptedEntity,
} from "../offlineDatabase";
import { getValidOfflineGrant } from "../../auth/offlineSessionService";
import { queueOfflineOperation } from "../offlineSyncService";
import { requireOfflineDataKey } from "../../auth/offlineVaultService";
import type {
  LocalTransactionLineRecord,
  LocalTransactionPaymentStatus,
  LocalTransactionRecord,
  LocalTransactionSyncStatus,
} from "../localSync/localSyncStore";

interface CreateLocalTransactionLineInput {
  productId?: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateLocalTransactionInput {
  reference?: string;
  businessId: string;
  businessUnitId?: string;
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

export interface LocalTransactionInvoice extends LocalTransactionWithLines {
  subtotal: number;
  outstandingAmount: number;
  total: number;
}

const LOCAL_REFERENCE_PREFIX = "LOCAL";

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function entityId(localId: string): string {
  return `transaction:${localId}`;
}

function createReference(createdAt: string): string {
  const timestamp = createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${LOCAL_REFERENCE_PREFIX}-${timestamp}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function assertValidLine(
  line: CreateLocalTransactionLineInput,
  index: number,
): void {
  if (!line.productName.trim()) {
    throw new Error(`Transaction line ${index + 1} requires a product name.`);
  }
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new Error(
      `Transaction line ${index + 1} requires a quantity greater than zero.`,
    );
  }
  if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
    throw new Error(
      `Transaction line ${index + 1} requires a valid unit price.`,
    );
  }
}

function buildLineRecords(
  transactionLocalId: string,
  lines: CreateLocalTransactionLineInput[],
  createdAt: string,
): LocalTransactionLineRecord[] {
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

function getLineSummary(lines: LocalTransactionLineRecord[]): {
  amount: number;
  itemCount: number;
} {
  return lines.reduce(
    (summary, line) => ({
      amount: summary.amount + line.lineTotal,
      itemCount: summary.itemCount + line.quantity,
    }),
    { amount: 0, itemCount: 0 },
  );
}

async function saveTransaction(
  value: LocalTransactionWithLines,
): Promise<void> {
  const id = entityId(value.transaction.localId);
  await putEncryptedEntity({
    id,
    ownerId: value.transaction.recordedByUserId ?? "unknown",
    entityType: "transaction",
    serverVersion: null,
    value: await encryptJson(requireOfflineDataKey(), value, `entity:${id}`),
    updatedAt: value.transaction.updatedAt,
  });
}

async function decodeTransaction(
  localId: string,
): Promise<LocalTransactionWithLines | undefined> {
  const id = entityId(localId);
  const stored = await getEncryptedEntity(id);
  if (!stored) return undefined;
  return decryptJson<LocalTransactionWithLines>(
    requireOfflineDataKey(),
    stored.value,
    `entity:${id}`,
  );
}

async function decodeAllTransactions(): Promise<LocalTransactionWithLines[]> {
  const records = await getEncryptedEntitiesByType("transaction");
  return Promise.all(
    records.map((record) =>
      decryptJson<LocalTransactionWithLines>(
        requireOfflineDataKey(),
        record.value,
        `entity:${record.id}`,
      ),
    ),
  );
}

function matchesText(value: string | undefined, query: string): boolean {
  return normalizeSearch(value ?? "").includes(query);
}

export async function createLocalTransaction(
  input: CreateLocalTransactionInput,
): Promise<LocalTransactionWithLines> {
  if (!input.customerName.trim()) {
    throw new Error("Transaction requires a customer name.");
  }
  if (input.lines.length === 0) {
    throw new Error("Transaction requires at least one product line.");
  }

  const grant = await getValidOfflineGrant();
  if (!grant) throw new Error("offline_authorization_required");
  if (
    !input.recordedByUserId ||
    input.recordedByUserId !== grant.payload.userId ||
    !grant.payload.businessIds.includes(input.businessId)
  ) {
    throw new Error("offline_scope_denied");
  }

  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const localId = createId("txn");
  const lines = buildLineRecords(localId, input.lines, createdAt);
  const { amount, itemCount } = getLineSummary(lines);
  const outstandingAmount = Math.max(input.outstandingAmount ?? 0, 0);
  const paymentStatus =
    input.paymentStatus ?? (outstandingAmount > 0 ? "pending" : "paid");
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
  const saved = { transaction, lines };

  await saveTransaction(saved);
  await queueOfflineOperation({
    deviceId: grant.payload.deviceId,
    userId: grant.payload.userId,
    businessId: input.businessId,
    businessUnitId: input.businessUnitId,
    entityType: "transaction",
    entityId: localId,
    action: "create",
    payload: saved,
  });

  return saved;
}

export async function listLocalTransactions(
  filters: ListLocalTransactionsFilters = {},
): Promise<LocalTransactionRecord[]> {
  const records = await decodeAllTransactions();
  const productQuery = filters.productQuery
    ? normalizeSearch(filters.productQuery)
    : "";

  return records
    .filter(({ transaction, lines }) => {
      if (filters.businessId && transaction.businessId !== filters.businessId)
        return false;
      if (
        filters.businessUnitId &&
        transaction.businessUnitId !== filters.businessUnitId
      )
        return false;
      if (filters.status && transaction.status !== filters.status) return false;
      if (filters.syncStatus && transaction.syncStatus !== filters.syncStatus)
        return false;
      if (filters.recordedBy && transaction.recordedBy !== filters.recordedBy)
        return false;
      if (
        filters.customerQuery &&
        !matchesText(
          transaction.customerName,
          normalizeSearch(filters.customerQuery),
        )
      )
        return false;
      if (filters.dateFrom && transaction.createdAt < filters.dateFrom)
        return false;
      if (filters.dateTo && transaction.createdAt > filters.dateTo)
        return false;
      if (
        productQuery &&
        !lines.some(
          (line) =>
            matchesText(line.productNameSnapshot, productQuery) ||
            matchesText(line.skuSnapshot, productQuery),
        )
      )
        return false;
      return true;
    })
    .map(({ transaction }) => transaction)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLocalTransactionLines(
  localId: string,
): Promise<LocalTransactionLineRecord[]> {
  return (await decodeTransaction(localId))?.lines ?? [];
}

export async function getLocalTransactionInvoice(
  localId: string,
): Promise<LocalTransactionInvoice | undefined> {
  const value = await decodeTransaction(localId);
  if (!value) return undefined;
  const subtotal = value.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    ...value,
    subtotal,
    outstandingAmount: value.transaction.outstandingAmount ?? 0,
    total: subtotal,
  };
}
