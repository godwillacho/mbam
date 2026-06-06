import type {
  Product as IProduct,
  ProductUnit,
  StockMovement as IStockMovement,
  StockMovementReason,
  CreateProductPayload,
  UpdateProductPayload,
} from "../types";

export class Product implements IProduct {
  id: string;
  businessId: string;
  name: string;
  unit: ProductUnit;
  defaultPrice: number;
  stockQty: number | null;
  lowStockThreshold: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  constructor(data: IProduct) {
    this.id                = data.id;
    this.businessId        = data.businessId;
    this.name              = data.name.trim();
    this.unit              = data.unit;
    this.defaultPrice      = Math.max(0, data.defaultPrice);
    this.stockQty          = data.stockQty ?? null;
    this.lowStockThreshold = data.lowStockThreshold ?? null;
    this.isActive          = data.isActive;
    this.createdAt         = data.createdAt;
    this.updatedAt         = data.updatedAt;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get unitLabel(): string {
    const labels: Record<ProductUnit, string> = {
      piece:  "piece",
      kg:     "kg",
      g:      "g",
      litre:  "L",
      ml:     "ml",
      bag:    "bag",
      box:    "box",
      pack:   "pack",
      dozen:  "dozen",
      bottle: "bottle",
      roll:   "roll",
      other:  "unit",
    };
    return labels[this.unit];
  }

  get isStockTracked(): boolean {
    return this.stockQty !== null;
  }

  get isLowStock(): boolean {
    if (!this.isStockTracked || this.stockQty === null) return false;
    if (this.lowStockThreshold === null) return this.stockQty <= 0;
    return this.stockQty <= this.lowStockThreshold;
  }

  get isOutOfStock(): boolean {
    return this.isStockTracked && this.stockQty !== null && this.stockQty <= 0;
  }

  get stockStatus(): "ok" | "low" | "out" | "untracked" {
    if (!this.isStockTracked) return "untracked";
    if (this.isOutOfStock)    return "out";
    if (this.isLowStock)      return "low";
    return "ok";
  }

  get displayName(): string {
    return `${this.name} (${this.unitLabel})`;
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /** Apply a stock delta. Positive = stock in, negative = stock out */
  applyStockDelta(delta: number): Product {
    if (!this.isStockTracked || this.stockQty === null) return this;
    return new Product({
      ...this.toJSON(),
      stockQty: Math.max(0, this.stockQty + delta),
    });
  }

  toJSON(): IProduct {
    return {
      id:                this.id,
      businessId:        this.businessId,
      name:              this.name,
      unit:              this.unit,
      defaultPrice:      this.defaultPrice,
      stockQty:          this.stockQty,
      lowStockThreshold: this.lowStockThreshold,
      isActive:          this.isActive,
      createdAt:         this.createdAt,
      updatedAt:         this.updatedAt,
    };
  }

  static fromJSON(data: IProduct): Product {
    return new Product(data);
  }

  static buildCreatePayload(
    fields: {
      name: string;
      unit: ProductUnit;
      defaultPrice: number;
      stockQty?: number;
      lowStockThreshold?: number;
    },
    businessId: string
  ): CreateProductPayload {
    return {
      businessId,
      name:              fields.name.trim(),
      unit:              fields.unit,
      defaultPrice:      Math.max(0, fields.defaultPrice),
      stockQty:          fields.stockQty,
      lowStockThreshold: fields.lowStockThreshold,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class StockMovement implements IStockMovement {
  id: string;
  productId: string;
  transactionId: string | null;
  delta: number;
  reason: StockMovementReason;
  note: string | null;
  createdAt: string;
  createdBy: string;

  constructor(data: IStockMovement) {
    this.id            = data.id;
    this.productId     = data.productId;
    this.transactionId = data.transactionId ?? null;
    this.delta         = data.delta;
    this.reason        = data.reason;
    this.note          = data.note ?? null;
    this.createdAt     = data.createdAt;
    this.createdBy     = data.createdBy;
  }

  get isStockIn(): boolean  { return this.delta > 0; }
  get isStockOut(): boolean { return this.delta < 0; }

  get displayDelta(): string {
    return this.delta > 0 ? `+${this.delta}` : `${this.delta}`;
  }

  toJSON(): IStockMovement {
    return {
      id:            this.id,
      productId:     this.productId,
      transactionId: this.transactionId,
      delta:         this.delta,
      reason:        this.reason,
      note:          this.note,
      createdAt:     this.createdAt,
      createdBy:     this.createdBy,
    };
  }

  static fromJSON(data: IStockMovement): StockMovement {
    return new StockMovement(data);
  }
}
