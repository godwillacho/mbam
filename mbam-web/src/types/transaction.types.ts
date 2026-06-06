// ─────────────────────────────────────────────────────────────────────────────
// transaction.types.ts
// A transaction is one sale. It contains one or more transaction items.
// Transaction items use the snapshot pattern — they store name/price at the
// time of sale so records never change if the catalogue changes later.
// ─────────────────────────────────────────────────────────────────────────────

import type { Currency } from "./business.types";

export type TransactionStatus = "draft" | "completed" | "voided";

export type PaymentMethod =
  | "cash"
  | "mtn_momo"      // MTN Mobile Money
  | "orange_money"  // Orange Money
  | "card"          // virtual card (phase 3)
  | "credit"        // customer owes (on account)
  | "other";

// ── A single line item within a transaction ───────────────────────────────────
// Snapshot pattern: stores name + price at time of sale.
// productId is nullable — manual items (not in catalogue) have no productId.
export interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string | null;  // null = ad-hoc item not in catalogue
  itemName: string;          // snapshot of product name at sale time
  quantity: number;
  unitPrice: number;         // snapshot of price at sale time
  subtotal: number;          // quantity × unitPrice (computed, stored for immutability)
  unit: string;              // snapshot of unit
}

// ── A complete transaction (one sale) ────────────────────────────────────────
export interface Transaction {
  id: string;
  businessId: string;
  cashierId: string;         // userId of who recorded this
  cashierName: string;       // snapshot of cashier name at sale time
  customerName: string;
  note: string | null;
  items: TransactionItem[];
  subtotal: number;          // sum of item subtotals
  total: number;             // subtotal + any charges (currently same, reserved for future)
  currency: Currency;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;   // null = created offline, not yet synced to server
}

// ── Lightweight version for list views ───────────────────────────────────────
export interface TransactionSummary {
  id: string;
  customerName: string;
  total: number;
  currency: Currency;
  itemCount: number;
  cashierName: string;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  syncedAt: string | null;
}

// ── Draft state while recording a new sale (before saving) ───────────────────
export interface TransactionDraftItem {
  draftId: string;           // local-only temp id (uuid v4)
  productId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

export interface TransactionDraft {
  customerName: string;
  note: string;
  paymentMethod: PaymentMethod;
  items: TransactionDraftItem[];
}

// ── Payloads ──────────────────────────────────────────────────────────────────
export interface CreateTransactionPayload {
  businessId: string;
  customerName: string;
  note?: string;
  paymentMethod: PaymentMethod;
  items: {
    productId?: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    unit: string;
  }[];
}

// ── Filters for querying transaction history ──────────────────────────────────
export interface TransactionFilters {
  businessId: string;
  cashierId?: string;        // filter by specific cashier (owner only)
  status?: TransactionStatus;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;         // ISO date string
  dateTo?: string;
  search?: string;           // customer name search
  page?: number;
  limit?: number;
}
