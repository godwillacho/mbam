import type {
  DailySummary as IDailySummary,
  PeriodSummary as IPeriodSummary,
  CashierStats as ICashierStats,
  ReportPeriod,
} from "../types";
import { formatCurrency, formatCompact } from "../lib/filters";

export class DailySummary implements IDailySummary {
  businessId: string;
  date: string;
  totalRevenue: number;
  transactionCount: number;
  itemsSold: number;
  activeCashiers: number;
  revenueByPaymentMethod: Record<string, number>;
  vsYesterday: {
    revenueDelta: number;
    revenuePercent: number;
    transactionDelta: number;
  };

  constructor(data: IDailySummary) {
    this.businessId              = data.businessId;
    this.date                    = data.date;
    this.totalRevenue            = Math.round(data.totalRevenue);
    this.transactionCount        = data.transactionCount;
    this.itemsSold               = data.itemsSold;
    this.activeCashiers          = data.activeCashiers;
    this.revenueByPaymentMethod  = data.revenueByPaymentMethod;
    this.vsYesterday             = data.vsYesterday;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get revenueCompact(): string {
    return formatCompact(this.totalRevenue);
  }

  get revenueFull(): string {
    return formatCurrency(this.totalRevenue);
  }

  get revenueChangeLabel(): string {
    const p = Math.round(this.vsYesterday.revenuePercent);
    return p >= 0 ? `+${p}%` : `${p}%`;
  }

  get revenueIsUp(): boolean {
    return this.vsYesterday.revenuePercent >= 0;
  }

  get transactionChangeLabel(): string {
    const d = this.vsYesterday.transactionDelta;
    return d >= 0 ? `+${d}` : `${d}`;
  }

  get averageTransactionValue(): number {
    if (this.transactionCount === 0) return 0;
    return Math.round(this.totalRevenue / this.transactionCount);
  }

  /** Top payment method by revenue */
  get topPaymentMethod(): string | null {
    const entries = Object.entries(this.revenueByPaymentMethod);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  // ── Stat card data — ready to render, no computation in the component ─────

  get statCards(): { label: string; value: string; sub: string; trend: "up" | "down" | "neutral" }[] {
    return [
      {
        label:  "Today's revenue",
        value:  this.revenueCompact,
        sub:    `${this.revenueChangeLabel} vs yesterday`,
        trend:  this.revenueIsUp ? "up" : "down",
      },
      {
        label:  "Transactions",
        value:  String(this.transactionCount),
        sub:    `${this.transactionChangeLabel} vs yesterday`,
        trend:  this.vsYesterday.transactionDelta >= 0 ? "up" : "down",
      },
      {
        label:  "Items sold",
        value:  String(this.itemsSold),
        sub:    `Across ${this.transactionCount} sales`,
        trend:  "neutral",
      },
      {
        label:  "Active cashiers",
        value:  String(this.activeCashiers),
        sub:    "On shift today",
        trend:  "neutral",
      },
    ];
  }

  toJSON(): IDailySummary { return { ...this }; }

  static fromJSON(data: IDailySummary): DailySummary {
    return new DailySummary(data);
  }

  /** Build a zeroed summary for a date with no transactions */
  static empty(businessId: string, date: string): DailySummary {
    return new DailySummary({
      businessId,
      date,
      totalRevenue:           0,
      transactionCount:       0,
      itemsSold:              0,
      activeCashiers:         0,
      revenueByPaymentMethod: {},
      vsYesterday: {
        revenueDelta:      0,
        revenuePercent:    0,
        transactionDelta:  0,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class CashierStats implements ICashierStats {
  cashierId: string;
  cashierName: string;
  transactionCount: number;
  totalRevenue: number;
  averageTransactionValue: number;
  date: string;

  constructor(data: ICashierStats) {
    this.cashierId              = data.cashierId;
    this.cashierName            = data.cashierName;
    this.transactionCount       = data.transactionCount;
    this.totalRevenue           = Math.round(data.totalRevenue);
    this.averageTransactionValue = Math.round(
      data.transactionCount > 0 ? data.totalRevenue / data.transactionCount : 0
    );
    this.date = data.date;
  }

  get revenueCompact(): string { return formatCompact(this.totalRevenue); }

  toJSON(): ICashierStats { return { ...this }; }

  static fromJSON(data: ICashierStats): CashierStats {
    return new CashierStats(data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class PeriodSummary implements IPeriodSummary {
  businessId: string;
  period: ReportPeriod;
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  transactionCount: number;
  itemsSold: number;
  topProducts: IPeriodSummary["topProducts"];
  revenueByDay: IPeriodSummary["revenueByDay"];

  constructor(data: IPeriodSummary) {
    this.businessId      = data.businessId;
    this.period          = data.period;
    this.dateFrom        = data.dateFrom;
    this.dateTo          = data.dateTo;
    this.totalRevenue    = Math.round(data.totalRevenue);
    this.transactionCount = data.transactionCount;
    this.itemsSold       = data.itemsSold;
    this.topProducts     = data.topProducts;
    this.revenueByDay    = data.revenueByDay;
  }

  get averageDailyRevenue(): number {
    if (this.revenueByDay.length === 0) return 0;
    return Math.round(this.totalRevenue / this.revenueByDay.length);
  }

  get peakDay(): { date: string; revenue: number } | null {
    if (this.revenueByDay.length === 0) return null;
    return [...this.revenueByDay].sort((a, b) => b.revenue - a.revenue)[0];
  }

  toJSON(): IPeriodSummary { return { ...this }; }

  static fromJSON(data: IPeriodSummary): PeriodSummary {
    return new PeriodSummary(data);
  }
}
