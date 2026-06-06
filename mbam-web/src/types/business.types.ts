// ─────────────────────────────────────────────────────────────────────────────
// business.types.ts
// A business belongs to an owner. Cashiers are linked to a business.
// ─────────────────────────────────────────────────────────────────────────────

import type { Language } from "./user.types";

export type Currency = "XAF" | "XOF" | "NGN" | "GHS" | "KES" | "USD" | "EUR";

export type BusinessType =
  | "retail"        // general shop / market trader
  | "exchange"      // currency exchanger
  | "wholesale"     // bulk goods
  | "services"      // service provider
  | "food"          // restaurant / food stall
  | "other";

// ── Business record ───────────────────────────────────────────────────────────
export interface Business {
  id: string;
  ownerId: string;
  name: string;
  type: BusinessType;
  currency: Currency;
  language: Language;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Cashier account (a User with role="cashier" linked to a business) ─────────
export interface CashierAccount {
  id: string;
  userId: string;
  businessId: string;
  fullName: string;
  email: string;
  phone: string | null;
  initials: string;       // derived: "Jean Baptiste" → "JB"
  isActive: boolean;
  isOnline: boolean;      // live presence, updated via heartbeat
  transactionCountToday: number;
  revenueToday: number;
  inviteStatus: InviteStatus;
  createdAt: string;
  lastActiveAt: string | null;
}

export type InviteStatus = "pending" | "accepted" | "expired";

// ── Invite payload (owner invites a cashier by email) ────────────────────────
export interface CashierInvitePayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  businessId: string;
}
