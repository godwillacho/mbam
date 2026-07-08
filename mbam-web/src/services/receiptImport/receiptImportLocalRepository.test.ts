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

vi.mock("../../auth/offlineSessionService", () => ({ getValidOfflineGrant }));
vi.mock("../offlineSyncService", () => ({ queueOfflineOperation }));
vi.mock("../offlineDatabase", () => ({ getOutboxRecordsByStatus }));
vi.mock("../encryptionService", () => ({ decryptJson }));
vi.mock("../../auth/offlineVaultService", () => ({
  requireOfflineDataKey: vi.fn(() => "data-key"),
}));
vi.mock("../../auth/deviceBindingService", () => ({
  getDeviceBinding: vi.fn(async () => ({ deviceId: "device-one", fingerprint: "fp" })),
}));

import {
  listQueuedReceiptImportDrafts,
  queueReceiptImportDraft,
} from "./receiptImportLocalRepository";

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
    permissions: ["receipt_import.create"],
    authorizationVersion: 1,
    issuedAt: "2026-07-05T00:00:00.000Z",
    offlineUntil: "2026-08-05T00:00:00.000Z",
  },
};

const baseInput = {
  businessId: "business-one",
  businessUnitId: "unit-one",
  fileName: "receipt.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
  imageBase64: "ZmFrZS1pbWFnZS1ieXRlcw==",
};

describe("receiptImportLocalRepository", () => {
  beforeEach(() => {
    getValidOfflineGrant.mockReset();
    queueOfflineOperation.mockReset();
    getOutboxRecordsByStatus.mockReset().mockResolvedValue([]);
    decryptJson.mockReset();
  });

  it("rejects an oversized image before ever checking scope", async () => {
    await expect(
      queueReceiptImportDraft({ ...baseInput, sizeBytes: 11 * 1024 * 1024 }),
    ).rejects.toThrow("receipt_import_file_too_large");
    expect(getValidOfflineGrant).not.toHaveBeenCalled();
  });

  it("rejects an unsupported MIME type before checking scope", async () => {
    await expect(
      queueReceiptImportDraft({ ...baseInput, mimeType: "application/pdf" }),
    ).rejects.toThrow("receipt_import_unsupported_file_type");
    expect(getValidOfflineGrant).not.toHaveBeenCalled();
  });

  it("fails closed when there is no offline grant", async () => {
    getValidOfflineGrant.mockResolvedValue(null);
    await expect(queueReceiptImportDraft(baseInput)).rejects.toThrow(
      "offline_receipt_import_scope_denied",
    );
  });

  it("fails closed when the grant lacks the receipt_import.create permission", async () => {
    getValidOfflineGrant.mockResolvedValue({
      ...grantedForBusinessOne,
      payload: { ...grantedForBusinessOne.payload, permissions: [] },
    });
    await expect(queueReceiptImportDraft(baseInput)).rejects.toThrow(
      "offline_receipt_import_scope_denied",
    );
  });

  it("queues the draft and returns metadata only, never the raw image bytes", async () => {
    getValidOfflineGrant.mockResolvedValue(grantedForBusinessOne);

    const draft = await queueReceiptImportDraft(baseInput);

    expect(draft.fileName).toBe("receipt.jpg");
    expect(draft.mimeType).toBe("image/jpeg");
    expect(draft.sizeBytes).toBe(1024);
    expect(draft).not.toHaveProperty("imageBase64");
    expect(queueOfflineOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "receipt_import",
        entityId: draft.localId,
        action: "create",
        businessId: "business-one",
        businessUnitId: "unit-one",
        payload: { image: draft, imageBase64: baseInput.imageBase64 },
      }),
    );
  });

  it("lists queued drafts as metadata only, without exposing the raw image bytes", async () => {
    getOutboxRecordsByStatus.mockImplementation(async (status: string) =>
      status === "pending"
        ? [{ operationId: "op-1", entityType: "receipt_import", value: "enc-1" }]
        : [],
    );
    decryptJson.mockResolvedValue({
      image: { localId: "receipt-1", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10, capturedAt: "now" },
      imageBase64: "should-not-leak",
    });

    const drafts = await listQueuedReceiptImportDrafts();

    expect(drafts).toEqual([
      { localId: "receipt-1", fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10, capturedAt: "now" },
    ]);
  });
});
