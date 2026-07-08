import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getValidOfflineGrant,
  queueOfflineOperation,
  getOutboxRecordsByStatus,
  decryptJson,
} = vi.hoisted(() => ({
  getValidOfflineGrant: vi.fn(),
  queueOfflineOperation: vi.fn(),
  getOutboxRecordsByStatus: vi.fn(),
  decryptJson: vi.fn(),
}));

vi.mock("../offlineSessionService", () => ({ getValidOfflineGrant }));
vi.mock("../offlineSyncService", () => ({ queueOfflineOperation }));
vi.mock("../offlineDatabase", () => ({ getOutboxRecordsByStatus }));
vi.mock("../encryptionService", () => ({ decryptJson }));
vi.mock("../offlineVaultService", () => ({
  requireOfflineDataKey: vi.fn(() => "data-key"),
}));
vi.mock("../deviceBindingService", () => ({
  getDeviceBinding: vi.fn(async () => ({ deviceId: "device-one", fingerprint: "fp" })),
}));

import { listQueuedStockMovements, queueStockMovement } from "./stockLocalRepository";

const grantedForBusinessOne = {
  token: "token",
  payload: {
    grantId: "grant-one",
    userId: "user-one",
    displayName: "Ada",
    email: "ada@example.com",
    deviceId: "device-one",
    baselineRole: "shop_manager",
    businessIds: ["business-one"],
    businessUnitIds: ["unit-one"],
    permissions: ["stock.movement.create"],
    authorizationVersion: 1,
    issuedAt: "2026-07-05T00:00:00.000Z",
    offlineUntil: "2026-08-05T00:00:00.000Z",
  },
};

const baseInput = {
  businessAccountId: "account-one",
  businessId: "business-one",
  businessUnitId: "unit-one",
  productId: "product-one",
  movementType: "sale" as const,
  quantityDelta: -2,
};

describe("stockLocalRepository", () => {
  beforeEach(() => {
    getValidOfflineGrant.mockReset();
    queueOfflineOperation.mockReset();
    getOutboxRecordsByStatus.mockReset().mockResolvedValue([]);
    decryptJson.mockReset();
  });

  it("fails closed when there is no offline grant at all", async () => {
    getValidOfflineGrant.mockResolvedValue(null);
    await expect(queueStockMovement(baseInput)).rejects.toThrow(
      "offline_stock_scope_denied",
    );
    expect(queueOfflineOperation).not.toHaveBeenCalled();
  });

  it("fails closed when the grant does not cover the requested business", async () => {
    getValidOfflineGrant.mockResolvedValue({
      ...grantedForBusinessOne,
      payload: { ...grantedForBusinessOne.payload, businessIds: ["some-other-business"] },
    });
    await expect(queueStockMovement(baseInput)).rejects.toThrow(
      "offline_stock_scope_denied",
    );
  });

  it("fails closed when the grant lacks the stock.movement.create permission", async () => {
    getValidOfflineGrant.mockResolvedValue({
      ...grantedForBusinessOne,
      payload: { ...grantedForBusinessOne.payload, permissions: [] },
    });
    await expect(queueStockMovement(baseInput)).rejects.toThrow(
      "offline_stock_scope_denied",
    );
  });

  it("queues a stock movement when the grant covers the business and permission", async () => {
    getValidOfflineGrant.mockResolvedValue(grantedForBusinessOne);

    const draft = await queueStockMovement(baseInput);

    expect(draft.productId).toBe("product-one");
    expect(draft.movementType).toBe("sale");
    expect(draft.quantityDelta).toBe(-2);
    expect(draft.createdBy).toBe("user-one");
    expect(queueOfflineOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "stock_movement",
        entityId: draft.localId,
        action: "create",
        businessId: "business-one",
        businessUnitId: "unit-one",
        payload: draft,
      }),
    );
  });

  it("lists only stock_movement records across every pending/failed status", async () => {
    getOutboxRecordsByStatus.mockImplementation(async (status: string) => {
      if (status === "pending") {
        return [
          { operationId: "op-1", entityType: "stock_movement", value: "enc-1" },
          { operationId: "op-2", entityType: "product", value: "enc-2" },
        ];
      }
      if (status === "failed") {
        return [{ operationId: "op-3", entityType: "stock_movement", value: "enc-3" }];
      }
      return [];
    });
    decryptJson.mockImplementation(async (_key: unknown, value: string) => ({
      localId: value,
    }));

    const movements = await listQueuedStockMovements();

    expect(movements.map((movement) => movement.localId)).toEqual(["enc-1", "enc-3"]);
  });
});
