// ─────────────────────────────────────────────────────────────────────────────
// analytics.types.ts
// Aggregated data for dashboard stats and reports.
// Computed server-side, never derived on the frontend from raw transactions.
// ─────────────────────────────────────────────────────────────────────────────

// ── Daily summary — main dashboard stats ─────────────────────────────────────
export interface DailySummary {
  businessId: string;
  date: string;              // "2024-06-06"
  totalRevenue: number;
  transactionCount: number;
  itemsSold: number;
  activeCashiers: number;
  revenueByPaymentMethod: Record<string, number>;
  vsYesterday: {
    revenueDelta: number;    // absolute change in XAF
    revenuePercent: number;  // percentage change
    transactionDelta: number;
  };
}

// ── Per-cashier stats ─────────────────────────────────────────────────────────
export interface CashierStats {
  cashierId: string;
  cashierName: string;
  transactionCount: number;
  totalRevenue: number;
  averageTransactionValue: number;
  date: string;
}

// ── Period summary — for reports page ────────────────────────────────────────
export type ReportPeriod = "today" | "week" | "month" | "custom";

export interface PeriodSummary {
  businessId: string;
  period: ReportPeriod;
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  transactionCount: number;
  itemsSold: number;
  topProducts: {
    productId: string | null;
    name: string;
    quantitySold: number;
    revenue: number;
  }[];
  revenueByDay: {
    date: string;
    revenue: number;
    transactionCount: number;
  }[];
}
