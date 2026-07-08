// Offline service-layer groundwork for the not-yet-built receipt-import
// feature (see docs/future-receipt-import.md). Queues a captured receipt
// image through the existing generic offline outbox so the image survives
// being captured while offline and is pushed to
// `POST /api/v1/receipt-imports` (not built yet) the next time the device
// syncs -- matching that document's intended flow step 3: "the frontend
// stores the receipt draft locally while offline."
//
// Like `stockLocalRepository.ts`, this deliberately does not also persist a
// separate "entities" read-model copy: a queued receipt image is a one-shot
// upload request, not mutable current-state.

import type { ReceiptImageDraft } from "../../types/receiptImport";
import { decryptJson } from "../encryptionService";
import { getOutboxRecordsByStatus } from "../offlineDatabase";
import { getValidOfflineGrant } from "../offlineSessionService";
import { queueOfflineOperation } from "../offlineSyncService";
import { getDeviceBinding } from "../deviceBindingService";
import { requireOfflineDataKey } from "../offlineVaultService";

/**
 * The permission this queue will require once a real backend
 * `receipt_imports` module exists. No backend grants this permission today,
 * so `queueReceiptImportDraft` currently always throws
 * `offline_receipt_import_scope_denied` -- intentional fail-closed
 * behavior, matching `stockLocalRepository.ts`'s same-shaped guard.
 */
const RECEIPT_IMPORT_PERMISSION = "receipt_import.create";

/** Highest receipt image size this queue will accept, matching the 10 MB
 * ceiling docs/future-receipt-import.md's security section calls for
 * ("file size limits") even though the backend that will enforce it for
 * real doesn't exist yet -- the local queue shouldn't be the one place that
 * skips this rule. */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ReceiptImportDraftInput {
  businessId: string;
  businessUnitId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Base64-encoded image bytes (no `data:` URL prefix). */
  imageBase64: string;
}

/** Full outbox payload -- includes the raw image bytes alongside the
 * lightweight draft metadata, since the eventual push to
 * `POST /api/v1/receipt-imports` needs both. */
export interface ReceiptImportQueuedPayload {
  image: ReceiptImageDraft;
  imageBase64: string;
}

/**
 * Queues a captured receipt image while offline (or online, ahead of a real
 * extraction endpoint existing). Validates file size/MIME type up front --
 * the two checks docs/future-receipt-import.md calls out as required before
 * activating this feature -- even though full malware scanning and the
 * actual extraction call can only happen once the real backend module ships.
 */
export async function queueReceiptImportDraft(
  input: ReceiptImportDraftInput,
): Promise<ReceiptImageDraft> {
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("receipt_import_file_too_large");
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new Error("receipt_import_unsupported_file_type");
  }

  const grant = await getValidOfflineGrant();
  if (
    !grant ||
    !grant.payload.businessIds.includes(input.businessId) ||
    !grant.payload.permissions.includes(RECEIPT_IMPORT_PERMISSION)
  ) {
    throw new Error("offline_receipt_import_scope_denied");
  }

  const binding = await getDeviceBinding();
  const image: ReceiptImageDraft = {
    localId: crypto.randomUUID(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    capturedAt: new Date().toISOString(),
  };

  const payload: ReceiptImportQueuedPayload = {
    image,
    imageBase64: input.imageBase64,
  };

  await queueOfflineOperation({
    deviceId: binding.deviceId,
    userId: grant.payload.userId,
    businessId: input.businessId,
    businessUnitId: input.businessUnitId,
    entityType: "receipt_import",
    entityId: image.localId,
    action: "create",
    payload,
  });

  return image;
}

/**
 * Lists receipt image drafts still sitting in the local outbox (not yet
 * confirmed by a server, since no server endpoint exists yet). Returns only
 * the lightweight metadata, not the raw image bytes, to keep listing cheap.
 */
export async function listQueuedReceiptImportDrafts(): Promise<ReceiptImageDraft[]> {
  const statuses = ["pending", "syncing", "conflict", "failed"] as const;
  const recordGroups = await Promise.all(
    statuses.map((status) => getOutboxRecordsByStatus(status)),
  );
  const records = recordGroups
    .flat()
    .filter((record) => record.entityType === "receipt_import");

  const payloads = await Promise.all(
    records.map((record) =>
      decryptJson<ReceiptImportQueuedPayload>(
        requireOfflineDataKey(),
        record.value,
        `outbox:${record.operationId}`,
      ),
    ),
  );
  return payloads.map((payload) => payload.image);
}
