import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptedOutboxRecord } from "./offlineDatabase";
import type { CloudChange, SyncPullResult, SyncPushResult } from "../types/offline.types";

const {
  events,
  getOutboxRecordsByStatus,
  getOutboxRecord,
  putOutboxRecord,
  deleteOutboxRecord,
  putConflictRecord,
  putEncryptedEntity,
  deleteEncryptedEntity,
} = vi.hoisted(() => ({
  events: [] as string[],
  getOutboxRecordsByStatus: vi.fn(),
  getOutboxRecord: vi.fn(),
  putOutboxRecord: vi.fn(),
  deleteOutboxRecord: vi.fn(),
  putConflictRecord: vi.fn(),
  putEncryptedEntity: vi.fn(),
  deleteEncryptedEntity: vi.fn(),
}));

vi.mock("../auth/deviceBindingService", () => ({
  getDeviceBinding: vi.fn(async () => ({
    deviceId: "device-one",
    fingerprint: "fingerprint-one",
  })),
}));

vi.mock("../auth/offlineVaultService", () => ({
  requireOfflineDataKey: vi.fn(),
}));

// Encryption is not the concern of these tests -- pass values straight
// through in an object shape close enough to a real EncryptedValue that
// callers reading `.value`/decrypting it back out see their own payload.
vi.mock("./encryptionService", () => ({
  encryptJson: vi.fn(async (_key: unknown, payload: unknown) => ({ payload })),
  decryptJson: vi.fn(async (_key: unknown, value: { payload: unknown }) => value.payload),
}));

vi.mock("./offlineDatabase", () => ({
  deleteEncryptedEntity,
  deleteOutboxRecord,
  getOutboxRecord,
  getOutboxRecordsByStatus,
  getSyncCursor: vi.fn(async () => null),
  putConflictRecord,
  putEncryptedEntity,
  putOutboxRecord,
  reconcileCloudEntities: vi.fn(async () => events.push("reconcile-entities")),
  reconcileOfflineOutbox: vi.fn(async () => events.push("reconcile-outbox")),
  setSyncCursor: vi.fn(async () => events.push("cursor")),
}));

vi.mock("./localSync/localSyncStore", () => ({
  reconcileRoleScopedLocalData: vi.fn(async () => events.push("reconcile-role")),
}));

vi.mock("./business/businessService", () => ({
  BUSINESS_WORKSPACE_CHANGE_EVENT: "workspace-change",
}));

vi.mock("./apiClient", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
}));

import { synchronizeOfflineChanges } from "./offlineSyncService";

function emptyPull(overrides: Partial<SyncPullResult> = {}): SyncPullResult {
  return {
    cursor: "cursor-one",
    userId: "user-one",
    authorizationVersion: 8,
    allowedBusinessIds: [],
    allowedBusinessUnitIds: [],
    permissions: [],
    restrictToOwnRecords: false,
    authorizationScopes: [],
    allowedEntityKeys: [],
    changes: [],
    syncRunId: "run-one",
    ...overrides,
  };
}

function pendingRecord(
  overrides: Partial<EncryptedOutboxRecord> = {},
): EncryptedOutboxRecord {
  return {
    operationId: "op-one",
    deviceId: "device-one",
    userId: "user-one",
    businessId: "business-one",
    entityType: "transaction",
    entityId: "entity-one",
    action: "create",
    baseVersion: null,
    status: "pending",
    retryCount: 0,
    lastAttemptAt: null,
    errorMessage: null,
    value: { payload: { note: "queued while offline" } } as never,
    createdAt: "2026-07-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("offline sync authorization ordering", () => {
  beforeEach(() => {
    events.length = 0;
    getOutboxRecordsByStatus.mockReset();
    getOutboxRecord.mockReset();
    putOutboxRecord.mockReset();
    deleteOutboxRecord.mockReset();
    putConflictRecord.mockReset();
    putEncryptedEntity.mockReset();
    deleteEncryptedEntity.mockReset();
  });

  it("pulls and reconciles current authorization before reading queued writes", async () => {
    getOutboxRecordsByStatus.mockImplementation(async () => {
      events.push("read-pending");
      return [];
    });
    const transport = {
      pull: vi.fn(async () => {
        events.push("pull");
        return emptyPull();
      }),
      push: vi.fn(),
    };

    await synchronizeOfflineChanges(transport);

    expect(events.indexOf("pull")).toBeLessThan(events.indexOf("read-pending"));
    expect(events.indexOf("reconcile-outbox")).toBeLessThan(
      events.indexOf("read-pending"),
    );
    expect(transport.push).not.toHaveBeenCalled();
  });

  it("deletes the outbox record when the push is accepted", async () => {
    const record = pendingRecord();
    getOutboxRecordsByStatus.mockResolvedValue([record]);
    getOutboxRecord.mockResolvedValue(record);
    const pushResult: SyncPushResult = { operationId: record.operationId, outcome: "accepted" };
    const transport = {
      pull: vi.fn(async () => emptyPull()),
      push: vi.fn(async () => [pushResult]),
    };

    await synchronizeOfflineChanges(transport);

    expect(deleteOutboxRecord).toHaveBeenCalledWith(record.operationId);
    expect(putConflictRecord).not.toHaveBeenCalled();
  });

  it("records a conflict and marks the outbox record as conflict when the push conflicts", async () => {
    const record = pendingRecord();
    getOutboxRecordsByStatus.mockResolvedValue([record]);
    getOutboxRecord.mockResolvedValue(record);
    const pushResult: SyncPushResult = {
      operationId: record.operationId,
      outcome: "conflict",
      error: "stale_version",
      cloudValue: { note: "server has a newer copy" },
    };
    const transport = {
      pull: vi.fn(async () => emptyPull()),
      push: vi.fn(async () => [pushResult]),
    };

    await synchronizeOfflineChanges(transport);

    expect(deleteOutboxRecord).not.toHaveBeenCalled();
    expect(putOutboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: record.operationId, status: "conflict", errorMessage: "stale_version" }),
    );
    expect(putConflictRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: record.operationId,
        entityType: record.entityType,
        entityId: record.entityId,
      }),
    );
  });

  it("marks the outbox record failed and increments retryCount when the push is rejected", async () => {
    const record = pendingRecord({ retryCount: 1 });
    getOutboxRecordsByStatus.mockResolvedValue([record]);
    getOutboxRecord.mockResolvedValue(record);
    const pushResult: SyncPushResult = {
      operationId: record.operationId,
      outcome: "rejected",
      error: "validation_failed",
    };
    const transport = {
      pull: vi.fn(async () => emptyPull()),
      push: vi.fn(async () => [pushResult]),
    };

    await synchronizeOfflineChanges(transport);

    expect(putOutboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: record.operationId,
        status: "failed",
        retryCount: 2,
        errorMessage: "validation_failed",
      }),
    );
    expect(deleteOutboxRecord).not.toHaveBeenCalled();
  });

  it("keeps a network failure retryable until the 5th attempt, then marks it failed", async () => {
    const nearlyExhausted = pendingRecord({ retryCount: 3 });
    getOutboxRecordsByStatus.mockResolvedValue([nearlyExhausted]);
    const transport = {
      pull: vi.fn(async () => emptyPull()),
      push: vi.fn(async () => {
        throw new Error("network_unreachable");
      }),
    };

    await expect(synchronizeOfflineChanges(transport)).rejects.toThrow("network_unreachable");

    // retryCount 3 -> 4 is still below the 5-attempt ceiling, so the
    // operation must stay "pending" (eligible to retry next sync), not be
    // given up on after a single transient network error.
    expect(putOutboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: nearlyExhausted.operationId,
        status: "pending",
        retryCount: 4,
      }),
    );
  });

  it("gives up after the 5th failed attempt instead of retrying forever", async () => {
    const exhausted = pendingRecord({ retryCount: 4 });
    getOutboxRecordsByStatus.mockResolvedValue([exhausted]);
    const transport = {
      pull: vi.fn(async () => emptyPull()),
      push: vi.fn(async () => {
        throw new Error("network_unreachable");
      }),
    };

    await expect(synchronizeOfflineChanges(transport)).rejects.toThrow("network_unreachable");

    expect(putOutboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: exhausted.operationId,
        status: "failed",
        retryCount: 5,
      }),
    );
  });

  it("applies a created/updated cloud change to the local encrypted entity store", async () => {
    getOutboxRecordsByStatus.mockResolvedValue([]);
    const change: CloudChange = {
      changeId: "change-one",
      entityType: "customer",
      entityId: "customer-one",
      version: 3,
      deleted: false,
      payload: { name: "Ada" },
      changedAt: "2026-07-05T00:00:00.000Z",
    };
    const transport = {
      pull: vi.fn(async () => emptyPull({ changes: [change] })),
      push: vi.fn(),
    };

    await synchronizeOfflineChanges(transport);

    expect(putEncryptedEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "customer:customer-one",
        ownerId: "cloud",
        entityType: "customer",
        serverVersion: 3,
      }),
    );
    expect(deleteEncryptedEntity).not.toHaveBeenCalled();
  });

  it("removes the local encrypted entity when a cloud change is a delete", async () => {
    getOutboxRecordsByStatus.mockResolvedValue([]);
    const change: CloudChange = {
      changeId: "change-two",
      entityType: "product",
      entityId: "product-one",
      version: 5,
      deleted: true,
      changedAt: "2026-07-05T00:00:00.000Z",
    };
    const transport = {
      pull: vi.fn(async () => emptyPull({ changes: [change] })),
      push: vi.fn(),
    };

    await synchronizeOfflineChanges(transport);

    expect(deleteEncryptedEntity).toHaveBeenCalledWith("product:product-one");
    expect(putEncryptedEntity).not.toHaveBeenCalled();
  });
});
