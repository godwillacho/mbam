// ─────────────────────────────────────────────────────────────────────────────
// product.types.ts
// A product belongs to a business. It is the item catalogue.
// Products are referenced in transaction items via snapshot pattern —
// if a product is renamed/deleted, historical records are unaffected.
// ─────────────────────────────────────────────────────────────────────────────

export type ProductUnit =
  | "piece"   // single item
  | "kg"
  | "g"
  | "litre"
  | "ml"
  | "bag"
  | "box"
  | "pack"
  | "dozen"
  | "bottle"
  | "roll"
  | "other";

// ── Product record (the catalogue entry) ─────────────────────────────────────
export interface Product {
  id: string;
  businessId: string;
  name: string;
  unit: ProductUnit;
  defaultPrice: number;   // in business currency (e.g. XAF)
  stockQty: number | null; // null = stock tracking not enabled
  lowStockThreshold: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Lightweight version for autocomplete suggestions ─────────────────────────
export interface ProductSuggestion {
  id: string;
  name: string;
  unit: ProductUnit;
  defaultPrice: number;
}

// ── Stock movement (phase 3 — stubbed) ───────────────────────────────────────
export type StockMovementReason =
  | "sale"          // auto-created on transaction
  | "restock"       // manual addition
  | "adjustment"    // correction
  | "loss"          // damage / theft
  | "return";       // customer return

export interface StockMovement {
  id: string;
  productId: string;
  transactionId: string | null;  // linked if reason = "sale"
  delta: number;                 // positive = stock in, negative = stock out
  reason: StockMovementReason;
  note: string | null;
  createdAt: string;
  createdBy: string;             // userId
}

// ── Payloads ──────────────────────────────────────────────────────────────────
export interface CreateProductPayload {
  businessId: string;
  name: string;
  unit: ProductUnit;
  defaultPrice: number;
  stockQty?: number;
  lowStockThreshold?: number;
}

export interface UpdateProductPayload {
  name?: string;
  unit?: ProductUnit;
  defaultPrice?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
}
