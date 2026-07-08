// Future stock management contract.
//
// This file is intentionally not wired into the active UI yet. It prepares the
// frontend data shape for inventory, stock movements, stock counts, and future
// sale-driven stock deductions. See docs/future-stock-management.md.
//
// Recreated 2026-07-05 as part of building out the offline service layer
// ahead of the stock-management feature itself (see
// services/stock/stockLocalRepository.ts) -- an earlier version of this file
// was removed as unreferenced dead code in the 2026-06-18 cleanup, before any
// offline-layer plumbing consumed it.

export type StockMovementType =
  | "opening_balance"
  | "purchase"
  | "sale"
  | "sale_refund"
  | "manual_adjustment"
  | "transfer_in"
  | "transfer_out"
  | "damaged"
  | "expired"
  | "returned";

export type StockPolicy = "allow_negative" | "warn_when_low" | "block_when_empty";

export type StockCountStatus = "draft" | "submitted" | "approved" | "cancelled";

export interface StockProfile {
  productId: string;
  businessAccountId: string;
  businessId: string;
  businessUnitId: string;
  quantityOnHand: number;
  reservedQuantity: number;
  reorderLevel?: number;
  stockPolicy: StockPolicy;
  lastCountedAt?: string;
  updatedAt: string;
}

export interface StockMovementDraft {
  localId: string;
  productId: string;
  businessAccountId: string;
  businessId: string;
  businessUnitId: string;
  movementType: StockMovementType;
  quantityDelta: number;
  unitCost?: number;
  sourceTransactionId?: string;
  sourceReceiptImportId?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
}

export interface StockCountLine {
  productId: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
  note?: string;
}

export interface StockCountDraft {
  localId: string;
  businessAccountId: string;
  businessId: string;
  businessUnitId: string;
  status: StockCountStatus;
  countedAt: string;
  countedBy: string;
  lines: StockCountLine[];
}
