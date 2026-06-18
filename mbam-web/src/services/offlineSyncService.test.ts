import { beforeEach, describe, expect, it, vi } from "vitest";

const { events, getOutboxRecordsByStatus } = vi.hoisted(() => ({
  events: [] as string[],
  getOutboxRecordsByStatus: vi.fn(),
}));

vi.mock("./deviceBindingService", () => ({
  getDeviceBinding: vi.fn(async () => ({
    deviceId: "device-one",
    fingerprint: "fingerprint-one",
  })),
}));

vi.mock("./offlineVaultService", () => ({
  requireOfflineDataKey: vi.fn(),
}));

vi.mock("./encryptionService", () => ({
  decryptJson: vi.fn(),
  encryptJson: vi.fn(),
}));

vi.mock("./offlineDatabase", () => ({
  deleteEncryptedEntity: vi.fn(),
  deleteOutboxRecord: vi.fn(),
  getOutboxRecord: vi.fn(),
  getOutboxRecordsByStatus,
  getSyncCursor: vi.fn(async () => null),
  putConflictRecord: vi.fn(),
  putEncryptedEntity: vi.fn(),
  putOutboxRecord: vi.fn(),
  reconcileCloudEntities: vi.fn(async () => events.push("reconcile-entities")),
  reconcileOfflineOutbox: vi.fn(async () => events.push("reconcile-outbox")),
  setSyncCursor: vi.fn(async () => events.push("cursor")),
}));

vi.mock("./localSync/localSyncStore", () => ({
  reconcileRoleScopedLocalData: vi.fn(async () => events.push("reconcile-role")),
}));

vi.mock("./businessService", () => ({
  BUSINESS_WORKSPACE_CHANGE_EVENT: "workspace-change",
}));

vi.mock("./apiClient", () => ({
  getJson: vi.fn(),
  postJson: vi.fn(),
}));

import { synchronizeOfflineChanges } from "./offlineSyncService";

describe("offline sync authorization ordering", () => {
  beforeEach(() => {
    events.length = 0;
    getOutboxRecordsByStatus.mockReset();
  });

  it("pulls and reconciles current authorization before reading queued writes", async () => {
    getOutboxRecordsByStatus.mockImplementation(async () => {
      events.push("read-pending");
      return [];
    });
    const transport = {
      pull: vi.fn(async () => {
        events.push("pull");
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
        };
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
});
