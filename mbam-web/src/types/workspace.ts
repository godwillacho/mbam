export type BusinessStatus = "active" | "disabled";
export type UnitType = "shop" | "warehouse" | "sales_desk";
export type TransactionStatus = "completed" | "queued" | "refunded";
export type PaymentMethod = "cash" | "mobile_money" | "card" | "bank_transfer";
export type ScopeLevel = "master" | "business" | "unit";

export interface MasterAccount {
  id: string;
  name: string;
  ownerName: string;
  currency: string;
}

export interface Business {
  id: string;
  name: string;
  type: string;
  country: string;
  currency: string;
  status: BusinessStatus;
}

export interface BusinessUnit {
  id: string;
  businessId: string;
  name: string;
  type: UnitType;
  location: string;
  status: BusinessStatus;
  todayRevenue: number;
  queuedTransactions: number;
}

export interface CustomerProfile {
  id: string;
  name: string;
  contact?: string;
  businessId?: string;
  lastPurchaseAt?: string;
  lastPaymentAt?: string;
  paymentDate?: string;
  totalSpent: number;
  pendingBalance: number;
}

export interface ProductCustomerPrice {
  customerId: string;
  price: number;
  lastSoldAt: string;
}

export interface ProductProfile {
  id: string;
  name: string;
  sku?: string;
  category: string;
  businessId?: string;
  defaultPrice: number;
  timesSold: number;
  lastSoldAt?: string;
  customerPrices?: ProductCustomerPrice[];
}

export interface TransactionRecord {
  id: string;
  reference: string;
  businessId: string;
  businessUnitId: string;
  customerName: string;
  itemCount: number;
  amount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  recordedBy: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  permissions: string[];
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  roleId: string;
  scopeLevel: ScopeLevel;
  businessId?: string;
  businessUnitId?: string;
  status: "active" | "invited" | "disabled";
}

export interface WorkspaceData {
  masterAccount: MasterAccount;
  businesses: Business[];
  businessUnits: BusinessUnit[];
  customers: CustomerProfile[];
  products: ProductProfile[];
  transactions: TransactionRecord[];
  roles: RoleSummary[];
  teamMembers: TeamMember[];
}
