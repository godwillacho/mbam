import { getJson, postJson } from "../apiClient";

/**
 * Movement types a caller may record by hand through this API. Mirrors
 * mbam-api's `stock::service::MANUAL_MOVEMENT_TYPES` -- `"sale"` is
 * deliberately excluded here too: sale movements are only ever written
 * automatically by the backend as a side effect of recording a sale
 * (`transactions::repository::apply_sale_stock_deductions`), never queued
 * or posted directly by this page.
 */
export type ManualStockMovementType =
  | "opening_balance"
  | "purchase"
  | "sale_refund"
  | "manual_adjustment"
  | "transfer_in"
  | "transfer_out"
  | "damaged"
  | "expired"
  | "returned";

export type StockMovementType = ManualStockMovementType | "sale";

export const MANUAL_STOCK_MOVEMENT_TYPES: ManualStockMovementType[] = [
  "purchase",
  "manual_adjustment",
  "transfer_in",
  "transfer_out",
  "damaged",
  "expired",
  "returned",
  "sale_refund",
  "opening_balance",
];

export interface StockMovement {
  id: string;
  productId: string;
  businessId: string;
  businessUnitId: string;
  movementType: StockMovementType;
  quantityDelta: number;
  unitCost?: number;
  sourceTransactionId?: string;
  sourceReceiptImportId?: string;
  note?: string;
  // Batch/lot expiry for this specific movement -- metadata only (see
  // mbam-api's 0015_stock_movement_expiry.sql). Only ever set on movements
  // that increase quantity; unrelated to products.expiryDate, which stays a
  // separate, manually-edited, single-value field on the product itself.
  expiryDate?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface StockMovementWritePayload {
  productId: string;
  movementType: ManualStockMovementType;
  quantityDelta: number;
  unitCost?: number;
  sourceReceiptImportId?: string;
  note?: string;
  expiryDate?: string;
}

export interface StockMovementFilters {
  productId?: string;
  businessUnitId?: string;
}

function stockMovementQueryString(filters: StockMovementFilters): string {
  const params = new URLSearchParams();
  if (filters.productId) params.set("product_id", filters.productId);
  if (filters.businessUnitId) params.set("business_unit_id", filters.businessUnitId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listStockMovements(
  filters: StockMovementFilters = {},
): Promise<StockMovement[]> {
  return getJson<StockMovement[]>(
    `/api/v1/stock/movements${stockMovementQueryString(filters)}`,
  );
}

/** Batches that recorded an expiry date, soonest-expiring first. */
export async function listExpiringStockBatches(
  filters: StockMovementFilters = {},
): Promise<StockMovement[]> {
  return getJson<StockMovement[]>(
    `/api/v1/stock/movements/expiring${stockMovementQueryString(filters)}`,
  );
}

export async function recordStockMovement(
  payload: StockMovementWritePayload,
): Promise<StockMovement> {
  return postJson<StockMovement, StockMovementWritePayload>(
    "/api/v1/stock/movements",
    payload,
  );
}
