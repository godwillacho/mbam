type BusinessStatus = "active" | "disabled";
export type UnitType = "shop" | "warehouse" | "sales_desk";
export type TransactionStatus = "completed" | "queued" | "refunded";
export type PaymentMethod = "cash" | "mobile_money" | "card" | "bank_transfer";
export type ScopeLevel = "master" | "business" | "unit";

interface MasterAccount {
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

interface ProductCustomerPrice {
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
  businessUnitId?: string;
  manufacturer?: string;
  brand?: string;
  variant?: string;
  packageSize?: string;
  unitOfMeasure?: string;
  barcode?: string;
  availableQuantity?: number;
  lowStockThreshold?: number;
  expiryDate?: string;
  costPrice?: number;
  defaultPrice: number;
  timesSold: number;
  lastSoldAt?: string;
  customerPrices?: ProductCustomerPrice[];
  serverVersion?: number;
  status?: "active" | "disabled";
  createdAt?: string;
  updatedAt?: string;
}

export interface TransactionRecord {
  id: string;
  reference: string;
  businessId: string;
  businessUnitId?: string;
  customerName: string;
  itemCount: number;
  amount: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  recordedBy: string;
}

export interface PendingPaymentRecord {
  id: string;
  reference: string;
  customerId: string;
  businessId: string;
  businessUnitId: string;
  originalAmount: number;
  amountPaid: number;
  outstandingAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  lastPaymentAt?: string;
  paymentDate?: string;
  recordedBy: string;
  note?: string;
}

interface RoleSummary {
  id: string;
  name: string;
  permissions: string[];
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName?: string;
  permissions?: string[];
  scopeLevel: ScopeLevel;
  businessId?: string;
  businessUnitId?: string;
  businessIds?: string[];
  businessUnitIds?: string[];
  authorizedRouteKeys?: string[];
  status: "active" | "invited" | "disabled";
}

export interface WorkspaceData {
  masterAccount: MasterAccount;
  businesses: Business[];
  businessUnits: BusinessUnit[];
  customers: CustomerProfile[];
  products: ProductProfile[];
  transactions: TransactionRecord[];
  pendingPayments: PendingPaymentRecord[];
  roles: RoleSummary[];
  teamMembers: TeamMember[];
}
