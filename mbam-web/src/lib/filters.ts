// ─────────────────────────────────────────────────────────────────────────────
// lib/filters.ts
// Pure functions for filtering, sorting, and transforming domain objects.
// No side effects. No API calls. Safe to use anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Transaction,
  TransactionSummary,
  TransactionFilters,
  TransactionDraft,
  TransactionDraftItem,
  Product,
  ProductSuggestion,
  CashierAccount,
  User,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION FILTERS
// ─────────────────────────────────────────────────────────────────────────────

/** Filter a list of transactions against a TransactionFilters object */
export function filterTransactions(
  transactions: Transaction[],
  filters: Partial<TransactionFilters>
): Transaction[] {
  return transactions.filter((tx) => {
    if (filters.businessId && tx.businessId !== filters.businessId) return false;
    if (filters.cashierId && tx.cashierId !== filters.cashierId) return false;
    if (filters.status && tx.status !== filters.status) return false;
    if (filters.paymentMethod && tx.paymentMethod !== filters.paymentMethod) return false;
    if (filters.dateFrom && tx.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && tx.createdAt > filters.dateTo + "T23:59:59Z") return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!tx.customerName.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Sort transactions — newest first by default */
export function sortTransactions(
  transactions: Transaction[],
  by: "date" | "amount" | "customer" = "date",
  dir: "asc" | "desc" = "desc"
): Transaction[] {
  return [...transactions].sort((a, b) => {
    let cmp = 0;
    if (by === "date") cmp = a.createdAt.localeCompare(b.createdAt);
    if (by === "amount") cmp = a.total - b.total;
    if (by === "customer") cmp = a.customerName.localeCompare(b.customerName);
    return dir === "desc" ? -cmp : cmp;
  });
}

/** Transactions that were created offline and not yet pushed to the server */
export function pendingSyncTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((tx) => tx.syncedAt === null && tx.status === "completed");
}

/** Slim a full Transaction down to a TransactionSummary for list views */
export function toTransactionSummary(tx: Transaction): TransactionSummary {
  return {
    id: tx.id,
    customerName: tx.customerName,
    total: tx.total,
    currency: tx.currency,
    itemCount: tx.items.length,
    cashierName: tx.cashierName,
    paymentMethod: tx.paymentMethod,
    status: tx.status,
    createdAt: tx.createdAt,
    syncedAt: tx.syncedAt,
  };
}

/** Group transactions by calendar date string ("2024-06-06") */
export function groupTransactionsByDate(
  transactions: Transaction[]
): Record<string, Transaction[]> {
  return transactions.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const date = tx.createdAt.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(tx);
    return acc;
  }, {});
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION DRAFT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Compute subtotal for a single draft line item */
export function draftItemSubtotal(item: TransactionDraftItem): number {
  return Math.round(item.quantity * item.unitPrice);
}

/** Compute total across all items in a draft */
export function draftTotal(draft: TransactionDraft): number {
  return draft.items.reduce((sum, item) => sum + draftItemSubtotal(item), 0);
}

/** Check whether a draft is valid enough to save */
export function isDraftValid(draft: TransactionDraft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!draft.customerName.trim()) errors.push("Customer name is required");
  if (draft.items.length === 0) errors.push("Add at least one item");
  draft.items.forEach((item, i) => {
    if (!item.itemName.trim()) errors.push(`Item ${i + 1}: name is required`);
    if (item.quantity <= 0) errors.push(`Item ${i + 1}: quantity must be greater than 0`);
    if (item.unitPrice < 0) errors.push(`Item ${i + 1}: price cannot be negative`);
  });
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT FILTERS
// ─────────────────────────────────────────────────────────────────────────────

/** Filter active products by name query — for autocomplete */
export function searchProducts(products: Product[], query: string): ProductSuggestion[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return products
    .filter((p) => p.isActive && p.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      defaultPrice: p.defaultPrice,
    }));
}

/** Products that are running low on stock */
export function lowStockProducts(products: Product[]): Product[] {
  return products.filter(
    (p) =>
      p.isActive &&
      p.stockQty !== null &&
      p.lowStockThreshold !== null &&
      p.stockQty <= p.lowStockThreshold
  );
}

/** Sort products alphabetically */
export function sortProductsAlpha(products: Product[]): Product[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// CASHIER FILTERS
// ─────────────────────────────────────────────────────────────────────────────

/** Only currently active cashier accounts */
export function activeCashiers(cashiers: CashierAccount[]): CashierAccount[] {
  return cashiers.filter((c) => c.isActive);
}

/** Cashiers currently online */
export function onlineCashiers(cashiers: CashierAccount[]): CashierAccount[] {
  return cashiers.filter((c) => c.isActive && c.isOnline);
}

/** Sort cashiers by today's revenue, descending */
export function sortCashiersByRevenue(cashiers: CashierAccount[]): CashierAccount[] {
  return [...cashiers].sort((a, b) => b.revenueToday - a.revenueToday);
}

// ─────────────────────────────────────────────────────────────────────────────
// USER / AUTH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Derive initials from a full name */
export function deriveInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}

/** Whether a user has permission to access owner-only features */
export function isOwner(user: User): boolean {
  return user.role === "owner";
}

export function isCashier(user: User): boolean {
  return user.role === "cashier";
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Format an amount in XAF with thousands separator */
export function formatCurrency(amount: number, currency = "XAF"): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} ${currency}`;
}

/** Format a compact amount for stat cards: 63500 → "63.5K" */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString("fr-FR");
}

/** Format ISO timestamp to "09:14" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format ISO date to "Mon 6 Jun" */
export function formatDate(iso: string, locale: "en" | "fr" = "en"): string {
  return new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Format ISO date to "Today", "Yesterday", or "Mon 6 Jun" */
export function formatRelativeDate(iso: string, locale: "en" | "fr" = "en"): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString())
    return locale === "fr" ? "Aujourd'hui" : "Today";
  if (date.toDateString() === yesterday.toDateString())
    return locale === "fr" ? "Hier" : "Yesterday";
  return formatDate(iso, locale);
}
