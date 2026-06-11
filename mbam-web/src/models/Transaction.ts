import { v4 as uuidv4 } from "uuid";
import type {
  Transaction as ITransaction,
  TransactionItem as ITransactionItem,
  TransactionDraft,
  TransactionDraftItem,
  TransactionSummary,
  PaymentMethod,
  TransactionStatus,
} from "../types";
import { draftTotal, isDraftValid, formatCurrency, formatTime, formatRelativeDate } from "../lib/filters";

type TransactionCurrency = ITransaction["currency"];

export class TransactionItem implements ITransactionItem {
  id: string;
  transactionId: string;
  productId: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  unit: string;

  constructor(data: ITransactionItem) {
    this.id            = data.id;
    this.transactionId = data.transactionId;
    this.productId     = data.productId ?? null;
    this.itemName      = data.itemName.trim();
    this.quantity      = data.quantity;
    this.unitPrice     = data.unitPrice;
    this.subtotal      = Math.round(data.quantity * data.unitPrice);
    this.unit          = data.unit;
  }

  get displayLine(): string {
    return `${this.itemName} × ${this.quantity}`;
  }

  toJSON(): ITransactionItem {
    return {
      id:            this.id,
      transactionId: this.transactionId,
      productId:     this.productId,
      itemName:      this.itemName,
      quantity:      this.quantity,
      unitPrice:     this.unitPrice,
      subtotal:      this.subtotal,
      unit:          this.unit,
    };
  }

  static fromJSON(data: ITransactionItem): TransactionItem {
    return new TransactionItem(data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class Transaction implements ITransaction {
  id: string;
  businessId: string;
  cashierId: string;
  cashierName: string;
  customerName: string;
  note: string | null;
  items: TransactionItem[];
  subtotal: number;
  total: number;
  currency: TransactionCurrency;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;

  constructor(data: ITransaction) {
    this.id            = data.id;
    this.businessId    = data.businessId;
    this.cashierId     = data.cashierId;
    this.cashierName   = data.cashierName;
    this.customerName  = data.customerName.trim();
    this.note          = data.note ?? null;
    this.items         = (data.items ?? []).map(i => new TransactionItem(i));
    this.subtotal      = Math.round(this.items.reduce((s, i) => s + i.subtotal, 0));
    this.total         = Math.round(data.total);
    this.currency      = data.currency;
    this.paymentMethod = data.paymentMethod;
    this.status        = data.status;
    this.createdAt     = data.createdAt;
    this.updatedAt     = data.updatedAt;
    this.syncedAt      = data.syncedAt ?? null;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get isSynced(): boolean    { return this.syncedAt !== null; }
  get isPending(): boolean   { return this.status === "draft"; }
  get isCompleted(): boolean { return this.status === "completed"; }
  get isVoided(): boolean    { return this.status === "voided"; }

  get itemCount(): number { return this.items.length; }

  get displayTime(): string {
    return formatTime(this.createdAt);
  }

  get displayDate(): string {
    return formatRelativeDate(this.createdAt);
  }

  get displayTotal(): string {
    return formatCurrency(this.total, this.currency);
  }

  /** One-line summary of items: "Rice 5kg, Palm oil × 2, ..." */
  get itemsSummary(): string {
    return this.items
      .slice(0, 3)
      .map(i => i.displayLine)
      .join(", ") + (this.items.length > 3 ? ` +${this.items.length - 3} more` : "");
  }

  get paymentMethodLabel(): string {
    const labels: Record<PaymentMethod, string> = {
      cash:         "Cash",
      mtn_momo:     "MTN MoMo",
      orange_money: "Orange Money",
      card:         "Card",
      credit:       "Credit",
      other:        "Other",
    };
    return labels[this.paymentMethod];
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  toSummary(): TransactionSummary {
    return {
      id:            this.id,
      customerName:  this.customerName,
      total:         this.total,
      currency:      this.currency,
      itemCount:     this.itemCount,
      cashierName:   this.cashierName,
      paymentMethod: this.paymentMethod,
      status:        this.status,
      createdAt:     this.createdAt,
      syncedAt:      this.syncedAt,
    };
  }

  toJSON(): ITransaction {
    return {
      id:            this.id,
      businessId:    this.businessId,
      cashierId:     this.cashierId,
      cashierName:   this.cashierName,
      customerName:  this.customerName,
      note:          this.note,
      items:         this.items.map(i => i.toJSON()),
      subtotal:      this.subtotal,
      total:         this.total,
      currency:      this.currency,
      paymentMethod: this.paymentMethod,
      status:        this.status,
      createdAt:     this.createdAt,
      updatedAt:     this.updatedAt,
      syncedAt:      this.syncedAt,
    };
  }

  static fromJSON(data: ITransaction): Transaction {
    return new Transaction(data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Mutable draft — lives only in the UI until saved */
export class TransactionDraftModel {
  customerName: string;
  note: string;
  paymentMethod: PaymentMethod;
  items: TransactionDraftItem[];

  constructor(initial?: Partial<TransactionDraft>) {
    this.customerName  = initial?.customerName ?? "";
    this.note          = initial?.note ?? "";
    this.paymentMethod = initial?.paymentMethod ?? "cash";
    this.items         = initial?.items ?? [];
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get total(): number { return draftTotal(this); }

  get isValid(): boolean { return isDraftValid(this).valid; }

  get validationErrors(): string[] { return isDraftValid(this).errors; }

  get isEmpty(): boolean {
    return this.customerName.trim() === "" && this.items.length === 0;
  }

  // ── Item mutation (returns new instance — immutable update pattern) ────────

  addItem(item: Omit<TransactionDraftItem, "draftId">): TransactionDraftModel {
    return new TransactionDraftModel({
      ...this.toJSON(),
      items: [...this.items, { ...item, draftId: uuidv4() }],
    });
  }

  updateItem(draftId: string, patch: Partial<TransactionDraftItem>): TransactionDraftModel {
    return new TransactionDraftModel({
      ...this.toJSON(),
      items: this.items.map(i => i.draftId === draftId ? { ...i, ...patch } : i),
    });
  }

  removeItem(draftId: string): TransactionDraftModel {
    return new TransactionDraftModel({
      ...this.toJSON(),
      items: this.items.filter(i => i.draftId !== draftId),
    });
  }

  setCustomer(name: string): TransactionDraftModel {
    return new TransactionDraftModel({ ...this.toJSON(), customerName: name });
  }

  setNote(note: string): TransactionDraftModel {
    return new TransactionDraftModel({ ...this.toJSON(), note });
  }

  setPaymentMethod(method: PaymentMethod): TransactionDraftModel {
    return new TransactionDraftModel({ ...this.toJSON(), paymentMethod: method });
  }

  clear(): TransactionDraftModel {
    return new TransactionDraftModel();
  }

  toJSON(): TransactionDraft {
    return {
      customerName:  this.customerName,
      note:          this.note,
      paymentMethod: this.paymentMethod,
      items:         this.items,
    };
  }

  static empty(): TransactionDraftModel {
    return new TransactionDraftModel();
  }

  static fromProduct(product: { id: string; name: string; unit: string; defaultPrice: number }): TransactionDraftModel {
    const draft = new TransactionDraftModel();
    return draft.addItem({
      productId: product.id,
      itemName:  product.name,
      quantity:  1,
      unitPrice: product.defaultPrice,
      unit:      product.unit,
    });
  }
}
