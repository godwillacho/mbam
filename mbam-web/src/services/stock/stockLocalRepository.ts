// Offline service-layer groundwork for the not-yet-built stock management
// feature (see docs/future-stock-management.md). This only queues a stock
// movement draft through the existing generic offline outbox -- there is no
// backend endpoint, permission, or UI wired up yet. It exists so the
// stock-management feature can be built directly on top of a proven sync
// engine instead of inventing a parallel one later.
//
// Deliberately does NOT also persist a copy into the "entities" store the
// way `productService.ts` does for products: a stock movement is a one-shot
// event (like a ledger line), not mutable current-state that needs a local
// read-model kept in sync with the cloud. `listQueuedStockMovements` reads
// the queue itself instead.

import type { StockMovementDraft, StockMovementType } from "../../types/stock";
import { decryptJson } from "../encryptionService";
import { getOutboxRecordsByStatus } from "../offlineDatabase";
import { getValidOfflineGrant } from "../../auth/offlineSessionService";
import { queueOfflineOperation } from "../offlineSyncService";
import { getDeviceBinding } from "../../auth/deviceBindingService";
import { requireOfflineDataKey } from "../../auth/offlineVaultService";

/**
 * The permission this queue will require once a real backend `stock` module
 * exists. No backend grants this permission today, so calling
 * `queueStockMovement` will currently always throw
 * `offline_stock_scope_denied` -- that is intentional fail-closed behavior
 * (see docs/security-rules.md), not a bug: this function must not silently
 * accept stock writes before there is a real authorization source for them.
 */
const STOCK_MOVEMENT_PERMISSION = "stock.movement.create";

export interface StockMovementInput {
  businessAccountId: string;
  businessId: string;
  businessUnitId: string;
  productId: string;
  movementType: StockMovementType;
  quantityDelta: number;
  unitCost?: number;
  sourceTransactionId?: string;
  sourceReceiptImportId?: string;
  note?: string;
}

/**
 * Queues a stock movement while offline (or online, ahead of a real
 * synchronous stock endpoint existing). Mirrors the scope-check +
 * queue-operation shape `productService.ts`'s `queueProductWrite` already
 * uses, so the eventual stock feature slots into the same pattern reviewers
 * already know.
 */
export async function queueStockMovement(
  input: StockMovementInput,
): Promise<StockMovementDraft> {
  const grant = await getValidOfflineGrant();
  if (
    !grant ||
    !grant.payload.businessIds.includes(input.businessId) ||
    !grant.payload.permissions.includes(STOCK_MOVEMENT_PERMISSION)
  ) {
    throw new Error("offline_stock_scope_denied");
  }

  const binding = await getDeviceBinding();
  const draft: StockMovementDraft = {
    localId: crypto.randomUUID(),
    productId: input.productId,
    businessAccountId: input.businessAccountId,
    businessId: input.businessId,
    businessUnitId: input.businessUnitId,
    movementType: input.movementType,
    quantityDelta: input.quantityDelta,
    unitCost: input.unitCost,
    sourceTransactionId: input.sourceTransactionId,
    sourceReceiptImportId: input.sourceReceiptImportId,
    note: input.note,
    createdAt: new Date().toISOString(),
    createdBy: grant.payload.userId,
  };

  await queueOfflineOperation({
    deviceId: binding.deviceId,
    userId: grant.payload.userId,
    businessId: input.businessId,
    businessUnitId: input.businessUnitId,
    entityType: "stock_movement",
    entityId: draft.localId,
    action: "create",
    payload: draft,
  });

  return draft;
}

/**
 * Lists stock movements still sitting in the local outbox (not yet
 * confirmed by a server, since no server endpoint exists yet). Useful for a
 * future "pending stock movements" UI without needing a separate read-model.
 */
export async function listQueuedStockMovements(): Promise<StockMovementDraft[]> {
  const statuses = ["pending", "syncing", "conflict", "failed"] as const;
  const recordGroups = await Promise.all(
    statuses.map((status) => getOutboxRecordsByStatus(status)),
  );
  const records = recordGroups
    .flat()
    .filter((record) => record.entityType === "stock_movement");

  return Promise.all(
    records.map((record) =>
      decryptJson<StockMovementDraft>(
        requireOfflineDataKey(),
        record.value,
        `outbox:${record.operationId}`,
      ),
    ),
  );
}
