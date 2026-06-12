import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  EncryptedValue,
  OfflineEntityType,
  OfflineOperationAction,
  OfflineOperationStatus,
  WrappedDataKey,
} from "../types/offline.types";

const DATABASE_NAME = "mbam-offline";
const DATABASE_VERSION = 1;

interface VaultRecord {
  id: "primary";
  userId: string;
  wrappedKey: WrappedDataKey;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedEntityRecord {
  id: string;
  ownerId: string;
  entityType: OfflineEntityType;
  serverVersion: number | null;
  value: EncryptedValue;
  updatedAt: string;
}

export interface EncryptedOutboxRecord {
  operationId: string;
  deviceId: string;
  userId: string;
  businessId: string;
  businessUnitId?: string;
  entityType: OfflineEntityType;
  entityId: string;
  action: OfflineOperationAction;
  baseVersion: number | null;
  status: OfflineOperationStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  value: EncryptedValue;
  createdAt: string;
}

export interface EncryptedConflictRecord {
  conflictId: string;
  operationId: string;
  entityType: OfflineEntityType;
  entityId: string;
  value: EncryptedValue;
  detectedAt: string;
}

export interface EncryptedGrantRecord {
  id: "current";
  userId: string;
  offlineUntil: string;
  value: EncryptedValue;
}

interface MetadataRecord {
  key: string;
  value: string;
}

interface MbamOfflineSchema extends DBSchema {
  vault: {
    key: "primary";
    value: VaultRecord;
  };
  entities: {
    key: string;
    value: EncryptedEntityRecord;
    indexes: {
      "by-owner": string;
      "by-type": OfflineEntityType;
    };
  };
  outbox: {
    key: string;
    value: EncryptedOutboxRecord;
    indexes: {
      "by-status": OfflineOperationStatus;
      "by-created-at": string;
    };
  };
  conflicts: {
    key: string;
    value: EncryptedConflictRecord;
    indexes: {
      "by-operation": string;
    };
  };
  grants: {
    key: "current";
    value: EncryptedGrantRecord;
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
}

let databasePromise: Promise<IDBPDatabase<MbamOfflineSchema>> | null = null;

export function getOfflineDatabase(): Promise<IDBPDatabase<MbamOfflineSchema>> {
  databasePromise ??= openDB<MbamOfflineSchema>(
    DATABASE_NAME,
    DATABASE_VERSION,
    {
      upgrade(database) {
        database.createObjectStore("vault", { keyPath: "id" });

        const entities = database.createObjectStore("entities", {
          keyPath: "id",
        });
        entities.createIndex("by-owner", "ownerId");
        entities.createIndex("by-type", "entityType");

        const outbox = database.createObjectStore("outbox", {
          keyPath: "operationId",
        });
        outbox.createIndex("by-status", "status");
        outbox.createIndex("by-created-at", "createdAt");

        const conflicts = database.createObjectStore("conflicts", {
          keyPath: "conflictId",
        });
        conflicts.createIndex("by-operation", "operationId");

        database.createObjectStore("grants", { keyPath: "id" });
        database.createObjectStore("metadata", { keyPath: "key" });
      },
    },
  );

  return databasePromise;
}

export async function getVaultRecord(): Promise<VaultRecord | undefined> {
  return (await getOfflineDatabase()).get("vault", "primary");
}

export async function saveVaultRecord(
  userId: string,
  wrappedKey: WrappedDataKey,
): Promise<void> {
  const database = await getOfflineDatabase();
  const existing = await database.get("vault", "primary");
  const now = new Date().toISOString();
  await database.put("vault", {
    id: "primary",
    userId,
    wrappedKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function clearOfflineDatabase(): Promise<void> {
  const database = await getOfflineDatabase();
  const transaction = database.transaction(
    ["vault", "entities", "outbox", "conflicts", "grants", "metadata"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("vault").clear(),
    transaction.objectStore("entities").clear(),
    transaction.objectStore("outbox").clear(),
    transaction.objectStore("conflicts").clear(),
    transaction.objectStore("grants").clear(),
    transaction.objectStore("metadata").clear(),
    transaction.done,
  ]);
}

export async function putEncryptedEntity(
  record: EncryptedEntityRecord,
): Promise<void> {
  await (await getOfflineDatabase()).put("entities", record);
}

export async function getEncryptedEntity(
  id: string,
): Promise<EncryptedEntityRecord | undefined> {
  return (await getOfflineDatabase()).get("entities", id);
}

export async function getEncryptedEntitiesByType(
  entityType: OfflineEntityType,
): Promise<EncryptedEntityRecord[]> {
  return (await getOfflineDatabase()).getAllFromIndex(
    "entities",
    "by-type",
    entityType,
  );
}

export async function deleteEncryptedEntity(id: string): Promise<void> {
  await (await getOfflineDatabase()).delete("entities", id);
}

export async function putOutboxRecord(
  record: EncryptedOutboxRecord,
): Promise<void> {
  await (await getOfflineDatabase()).put("outbox", record);
}

export async function getOutboxRecord(
  operationId: string,
): Promise<EncryptedOutboxRecord | undefined> {
  return (await getOfflineDatabase()).get("outbox", operationId);
}

export async function getOutboxRecordsByStatus(
  status: OfflineOperationStatus,
): Promise<EncryptedOutboxRecord[]> {
  return (await getOfflineDatabase()).getAllFromIndex(
    "outbox",
    "by-status",
    status,
  );
}

export async function deleteOutboxRecord(operationId: string): Promise<void> {
  await (await getOfflineDatabase()).delete("outbox", operationId);
}

export async function putConflictRecord(
  record: EncryptedConflictRecord,
): Promise<void> {
  await (await getOfflineDatabase()).put("conflicts", record);
}

export async function saveGrantRecord(
  record: EncryptedGrantRecord,
): Promise<void> {
  await (await getOfflineDatabase()).put("grants", record);
}

export async function getGrantRecord(): Promise<
  EncryptedGrantRecord | undefined
> {
  return (await getOfflineDatabase()).get("grants", "current");
}

export async function deleteGrantRecord(): Promise<void> {
  await (await getOfflineDatabase()).delete("grants", "current");
}

export async function setSyncCursor(cursor: string): Promise<void> {
  await (
    await getOfflineDatabase()
  ).put("metadata", {
    key: "sync-cursor",
    value: cursor,
  });
}

export async function getSyncCursor(): Promise<string | null> {
  const record = await (
    await getOfflineDatabase()
  ).get("metadata", "sync-cursor");
  return record?.value ?? null;
}
