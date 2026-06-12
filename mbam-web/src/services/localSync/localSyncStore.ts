import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PaymentMethod, TransactionStatus } from "../../types/workspace";

export type LocalSyncModule =
  | "businesses"
  | "customers"
  | "inventory"
  | "pendingPayments"
  | "products"
  | "reports"
  | "transactions";

export type LocalSyncMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type LocalSyncSource = "api" | "cache" | "fallback" | "queued";

export type LocalTransactionSyncStatus = "local" | "queued" | "syncing" | "synced" | "failed" | "rejected";
export type LocalTransactionPaymentStatus = "paid" | "pending";
export type LocalCustomerSyncStatus = "local" | "queued" | "synced" | "failed" | "rejected";
export type LocalCustomerSource = "api" | "workspace" | "local";

export interface LocalCustomerRecord {
  localId: string;
  serverId?: string;
  name: string;
  normalizedName: string;
  contact?: string;
  businessId?: string;
  businessUnitIds: string[];
  attendedByNames: string[];
  attendedByUserIds: string[];
  lastPurchaseAt?: string;
  lastPaymentAt?: string;
  paymentDate?: string;
  totalSpent: number;
  pendingBalance: number;
  source: LocalCustomerSource;
  syncStatus: LocalCustomerSyncStatus;
  createdAt: string;
  updatedAt: string;
  rolePolicyVersion?: string;
}

export interface LocalTransactionRecord {
  localId: string;
  serverId?: string;
  reference: string;
  businessId: string;
  businessUnitId: string;
  customerId?: string;
  customerName: string;
  customerContact?: string;
  itemCount: number;
  amount: number;
  outstandingAmount?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: LocalTransactionPaymentStatus;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  recordedBy: string;
  recordedByUserId?: string;
  syncStatus: LocalTransactionSyncStatus;
  syncError?: string;
  idempotencyKey: string;
  rolePolicyVersion?: string;
}

export interface LocalTransactionLineRecord {
  localLineId: string;
  transactionLocalId: string;
  productId?: string;
  productNameSnapshot: string;
  skuSnapshot?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
}

export interface LocalSyncCacheRecord<TData = unknown> {
  cacheKey: string;
  module: LocalSyncModule;
  path: string;
  data: TData;
  storedAt: string;
  rolePolicyVersion?: string;
}

export interface LocalSyncQueueRecord<TPayload = unknown> {
  id: string;
  module: LocalSyncModule;
  method: Exclude<LocalSyncMethod, "GET">;
  path: string;
  payload: TPayload;
  createdAt: string;
  lastAttemptAt?: string;
  attemptCount: number;
  status: "queued" | "syncing" | "failed";
  rolePolicyVersion?: string;
}

export interface LocalSyncMetaRecord {
  key: string;
  value: string;
  updatedAt: string;
}

interface MbamLocalSyncDb extends DBSchema {
  readCache: {
    key: string;
    value: LocalSyncCacheRecord;
    indexes: {
      "by-module": LocalSyncModule;
    };
  };
  writeQueue: {
    key: string;
    value: LocalSyncQueueRecord;
    indexes: {
      "by-status": LocalSyncQueueRecord["status"];
      "by-module": LocalSyncModule;
    };
  };
  customers: {
    key: string;
    value: LocalCustomerRecord;
    indexes: {
      "by-business": string;
      "by-name": string;
      "by-server-id": string;
      "by-sync-status": LocalCustomerSyncStatus;
    };
  };
  transactions: {
    key: string;
    value: LocalTransactionRecord;
    indexes: {
      "by-sync-status": LocalTransactionSyncStatus;
      "by-created-at": string;
      "by-business-unit": string;
      "by-customer": string;
      "by-recorded-by": string;
      "by-server-id": string;
    };
  };
  transactionLines: {
    key: string;
    value: LocalTransactionLineRecord;
    indexes: {
      "by-transaction-local-id": string;
      "by-product": string;
    };
  };
  meta: {
    key: string;
    value: LocalSyncMetaRecord;
  };
}

const LOCAL_SYNC_DB_NAME = "mbam-local-sync";
const LOCAL_SYNC_DB_VERSION = 3;
let dbPromise: Promise<IDBPDatabase<MbamLocalSyncDb>> | undefined;

export function getLocalSyncDb(): Promise<IDBPDatabase<MbamLocalSyncDb>> {
  dbPromise ??= openDB<MbamLocalSyncDb>(LOCAL_SYNC_DB_NAME, LOCAL_SYNC_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("readCache")) {
        const readCache = db.createObjectStore("readCache", { keyPath: "cacheKey" });
        readCache.createIndex("by-module", "module");
      }

      if (!db.objectStoreNames.contains("writeQueue")) {
        const writeQueue = db.createObjectStore("writeQueue", { keyPath: "id" });
        writeQueue.createIndex("by-status", "status");
        writeQueue.createIndex("by-module", "module");
      }

      if (!db.objectStoreNames.contains("customers")) {
        const customers = db.createObjectStore("customers", { keyPath: "localId" });
        customers.createIndex("by-business", "businessId");
        customers.createIndex("by-name", "normalizedName");
        customers.createIndex("by-server-id", "serverId");
        customers.createIndex("by-sync-status", "syncStatus");
      }

      if (!db.objectStoreNames.contains("transactions")) {
        const transactions = db.createObjectStore("transactions", { keyPath: "localId" });
        transactions.createIndex("by-sync-status", "syncStatus");
        transactions.createIndex("by-created-at", "createdAt");
        transactions.createIndex("by-business-unit", "businessUnitId");
        transactions.createIndex("by-customer", "customerName");
        transactions.createIndex("by-recorded-by", "recordedBy");
        transactions.createIndex("by-server-id", "serverId");
      }

      if (!db.objectStoreNames.contains("transactionLines")) {
        const transactionLines = db.createObjectStore("transactionLines", { keyPath: "localLineId" });
        transactionLines.createIndex("by-transaction-local-id", "transactionLocalId");
        transactionLines.createIndex("by-product", "productId");
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
  });

  return dbPromise;
}

export function getCacheKey(module: LocalSyncModule, path: string): string {
  return `${module}:${path}`;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function readCache<TData>(cacheKey: string): Promise<LocalSyncCacheRecord<TData> | undefined> {
  const db = await getLocalSyncDb();
  return db.get("readCache", cacheKey) as Promise<LocalSyncCacheRecord<TData> | undefined>;
}

export async function writeCache<TData>(record: LocalSyncCacheRecord<TData>): Promise<void> {
  const db = await getLocalSyncDb();
  await db.put("readCache", record as LocalSyncCacheRecord);
}

export async function enqueueWrite<TPayload>(record: LocalSyncQueueRecord<TPayload>): Promise<void> {
  const db = await getLocalSyncDb();
  await db.put("writeQueue", record as LocalSyncQueueRecord);
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getLocalSyncDb();
  await db.put("meta", { key, value, updatedAt: new Date().toISOString() });
}

export async function getSyncMeta(key: string): Promise<string | undefined> {
  const db = await getLocalSyncDb();
  return (await db.get("meta", key))?.value;
}
