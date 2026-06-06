import type {
  Business as IBusiness,
  CashierAccount as ICashierAccount,
  CashierInvitePayload,
  Currency,
  BusinessType,
  InviteStatus,
} from "../types";
import { deriveInitials, formatCurrency } from "../lib/filters";

export class Business implements IBusiness {
  id: string;
  ownerId: string;
  name: string;
  type: BusinessType;
  currency: Currency;
  language: "en" | "fr";
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  constructor(data: IBusiness) {
    this.id        = data.id;
    this.ownerId   = data.ownerId;
    this.name      = data.name.trim();
    this.type      = data.type;
    this.currency  = data.currency;
    this.language  = data.language;
    this.phone     = data.phone ?? null;
    this.address   = data.address ?? null;
    this.isActive  = data.isActive;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get displayCurrency(): string {
    return this.currency; // "XAF"
  }

  get typeLabel(): string {
    const labels: Record<BusinessType, string> = {
      retail:    "Retail shop",
      exchange:  "Currency exchange",
      wholesale: "Wholesale",
      services:  "Services",
      food:      "Food & beverage",
      other:     "Other",
    };
    return labels[this.type];
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  formatAmount(amount: number): string {
    return formatCurrency(amount, this.currency);
  }

  toJSON(): IBusiness {
    return {
      id:        this.id,
      ownerId:   this.ownerId,
      name:      this.name,
      type:      this.type,
      currency:  this.currency,
      language:  this.language,
      phone:     this.phone,
      address:   this.address,
      isActive:  this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(data: IBusiness): Business {
    return new Business(data);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class CashierAccount implements ICashierAccount {
  id: string;
  userId: string;
  businessId: string;
  fullName: string;
  email: string;
  phone: string | null;
  initials: string;
  isActive: boolean;
  isOnline: boolean;
  transactionCountToday: number;
  revenueToday: number;
  inviteStatus: InviteStatus;
  createdAt: string;
  lastActiveAt: string | null;

  constructor(data: ICashierAccount) {
    this.id                    = data.id;
    this.userId                = data.userId;
    this.businessId            = data.businessId;
    this.fullName              = data.fullName.trim();
    this.email                 = data.email.toLowerCase().trim();
    this.phone                 = data.phone ?? null;
    this.initials              = deriveInitials(data.fullName);
    this.isActive              = data.isActive;
    this.isOnline              = data.isOnline;
    this.transactionCountToday = data.transactionCountToday;
    this.revenueToday          = data.revenueToday;
    this.inviteStatus          = data.inviteStatus;
    this.createdAt             = data.createdAt;
    this.lastActiveAt          = data.lastActiveAt ?? null;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get firstName(): string {
    return this.fullName.split(" ")[0];
  }

  get statusLabel(): string {
    if (!this.isActive) return "Deactivated";
    if (this.isOnline)  return "Online";
    return "Offline";
  }

  get isPendingInvite(): boolean {
    return this.inviteStatus === "pending";
  }

  get canLogin(): boolean {
    return this.isActive && this.inviteStatus === "accepted";
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  toJSON(): ICashierAccount {
    return {
      id:                    this.id,
      userId:                this.userId,
      businessId:            this.businessId,
      fullName:              this.fullName,
      email:                 this.email,
      phone:                 this.phone,
      initials:              this.initials,
      isActive:              this.isActive,
      isOnline:              this.isOnline,
      transactionCountToday: this.transactionCountToday,
      revenueToday:          this.revenueToday,
      inviteStatus:          this.inviteStatus,
      createdAt:             this.createdAt,
      lastActiveAt:          this.lastActiveAt,
    };
  }

  static fromJSON(data: ICashierAccount): CashierAccount {
    return new CashierAccount(data);
  }

  static buildInvitePayload(
    fields: { firstName: string; lastName: string; email: string; phone?: string },
    businessId: string
  ): CashierInvitePayload {
    return {
      firstName:  fields.firstName.trim(),
      lastName:   fields.lastName.trim(),
      email:      fields.email.toLowerCase().trim(),
      phone:      fields.phone?.trim(),
      businessId,
    };
  }
}
