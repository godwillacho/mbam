import type {
  CloudChange,
  OfflineConflict,
  OfflineEntityType,
  OfflineOperation,
  OfflineOperationAction,
  SyncPullResult,
  SyncPushResult,
} from "../types/offline.types";
import { decryptJson, encryptJson } from "./encryptionService";
import {
  deleteEncryptedEntity,
  deleteOutboxRecord,
  getOutboxRecord,
  getOutboxRecordsByStatus,
  getSyncCursor,
  putConflictRecord,
  putEncryptedEntity,
  putOutboxRecord,
  reconcileCloudEntities,
  reconcileOfflineOutbox,
  setSyncCursor,
  type EncryptedOutboxRecord,
} from "./offlineDatabase";
import { requireOfflineDataKey } from "./offlineVaultService";
import { getJson, postJson } from "./apiClient";
import { reconcileRoleScopedLocalData } from "./localSync/localSyncStore";

export interface QueueOperationInput<T> {
  deviceId: string;
  userId: string;
  businessId: string;
  businessUnitId?: string;
  entityType: OfflineEntityType;
  entityId: string;
  action: OfflineOperationAction;
  baseVersion?: number | null;
  payload: T;
}

export interface SyncTransport {
  push(operations: OfflineOperation[]): Promise<SyncPushResult[]>;
  pull(cursor: string | null): Promise<SyncPullResult>;
}

export function createApiSyncTransport(): SyncTransport {
  return {
    push: (operations) =>
      postJson<SyncPushResult[], { operations: OfflineOperation[] }>(
        "/api/v1/sync/push",
        { operations },
      ),
    pull: (cursor) =>
      getJson<SyncPullResult>(
        cursor
          ? `/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}`
          : "/api/v1/sync/pull",
      ),
  };
}

function createId(): string {
  return crypto.randomUUID();
}

function operationAssociatedData(operationId: string): string {
  return `outbox:${operationId}`;
}

export async function queueOfflineOperation<T>(
  input: QueueOperationInput<T>,
): Promise<OfflineOperation<T>> {
  const operation: OfflineOperation<T> = {
    operationId: createId(),
    deviceId: input.deviceId,
    userId: input.userId,
    businessId: input.businessId,
    businessUnitId: input.businessUnitId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    baseVersion: input.baseVersion ?? null,
    payload: input.payload,
    createdAt: new Date().toISOString(),
  };
  const value = await encryptJson(
    requireOfflineDataKey(),
    operation.payload,
    operationAssociatedData(operation.operationId),
  );

  await putOutboxRecord({
    ...operation,
    status: "pending",
    retryCount: 0,
    lastAttemptAt: null,
    errorMessage: null,
    value,
  });

  return operation;
}

async function decryptOperation(
  record: EncryptedOutboxRecord,
): Promise<OfflineOperation> {
  const payload = await decryptJson(
    requireOfflineDataKey(),
    record.value,
    operationAssociatedData(record.operationId),
  );

  return {
    operationId: record.operationId,
    deviceId: record.deviceId,
    userId: record.userId,
    businessId: record.businessId,
    businessUnitId: record.businessUnitId,
    entityType: record.entityType,
    entityId: record.entityId,
    action: record.action,
    baseVersion: record.baseVersion,
    payload,
    createdAt: record.createdAt,
  };
}

async function applyCloudChange(change: CloudChange): Promise<void> {
  const id = `${change.entityType}:${change.entityId}`;
  if (change.deleted) {
    await deleteEncryptedEntity(id);
    return;
  }

  const value = await encryptJson(
    requireOfflineDataKey(),
    change.payload,
    `entity:${id}`,
  );
  await putEncryptedEntity({
    id,
    ownerId: "cloud",
    entityType: change.entityType,
    serverVersion: change.version,
    value,
    updatedAt: change.changedAt,
  });
}

async function recordConflict(
  operation: OfflineOperation,
  result: SyncPushResult,
): Promise<void> {
  const conflict: OfflineConflict = {
    conflictId: createId(),
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    localValue: operation.payload,
    cloudValue: result.cloudValue,
    detectedAt: new Date().toISOString(),
  };
  const value = await encryptJson(
    requireOfflineDataKey(),
    conflict,
    `conflict:${conflict.conflictId}`,
  );
  await putConflictRecord({
    conflictId: conflict.conflictId,
    operationId: conflict.operationId,
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    value,
    detectedAt: conflict.detectedAt,
  });
}

export async function synchronizeOfflineChanges(
  transport: SyncTransport,
): Promise<void> {
  const pendingRecords = await getOutboxRecordsByStatus("pending");
  const operations = await Promise.all(pendingRecords.map(decryptOperation));

  if (operations.length > 0) {
    const attemptTime = new Date().toISOString();
    await Promise.all(
      pendingRecords.map((record) =>
        putOutboxRecord({
          ...record,
          status: "syncing",
          lastAttemptAt: attemptTime,
        }),
      ),
    );

    let results: SyncPushResult[];
    try {
      results = await transport.push(operations);
    } catch (error) {
      await Promise.all(
        pendingRecords.map((record) =>
          putOutboxRecord({
            ...record,
            status: record.retryCount + 1 >= 5 ? "failed" : "pending",
            retryCount: record.retryCount + 1,
            errorMessage:
              error instanceof Error ? error.message : "sync_unavailable",
          }),
        ),
      );
      throw error;
    }
    for (const result of results) {
      const record = await getOutboxRecord(result.operationId);
      const operation = operations.find(
        (candidate) => candidate.operationId === result.operationId,
      );
      if (!record || !operation) continue;

      if (result.outcome === "accepted") {
        await deleteOutboxRecord(result.operationId);
      } else if (result.outcome === "conflict") {
        await putOutboxRecord({
          ...record,
          status: "conflict",
          errorMessage: result.error ?? "sync_conflict",
        });
        await recordConflict(operation, result);
      } else {
        await putOutboxRecord({
          ...record,
          status: "failed",
          retryCount: record.retryCount + 1,
          errorMessage: result.error ?? "sync_rejected",
        });
      }
    }
  }

  const pullResult = await transport.pull(await getSyncCursor());
  await reconcileCloudEntities(pullResult.allowedEntityKeys);
  await reconcileOfflineOutbox(
    pullResult.authorizationScopes,
    pullResult.authorizationVersion,
  );
  await reconcileRoleScopedLocalData({
    userId: pullResult.userId,
    authorizationScopes: pullResult.authorizationScopes,
    authorizationVersion: pullResult.authorizationVersion,
  });
  for (const change of pullResult.changes) {
    await applyCloudChange(change);
  }
  await setSyncCursor(pullResult.cursor);
}
