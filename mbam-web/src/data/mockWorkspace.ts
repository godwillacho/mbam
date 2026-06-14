import type { WorkspaceData } from "../types/workspace";
import type { AuthUser } from "../types/auth";

const demoWorkspace: WorkspaceData = {
  masterAccount: {
    id: "master-001",
    name: "Mbam Central Trading",
    ownerName: "Godwill Acho",
    currency: "XAF",
  },
  businesses: [
    { id: "business-grocery", name: "Mbam Grocery", type: "Retail grocery", country: "Cameroon", currency: "XAF", status: "active" },
    { id: "business-electronics", name: "Mbam Electronics", type: "Consumer electronics", country: "Cameroon", currency: "XAF", status: "active" },
  ],
  businessUnits: [
    { id: "unit-douala-shop", businessId: "business-grocery", name: "Douala Main Shop", type: "shop", location: "Akwa, Douala", status: "active", todayRevenue: 124500, queuedTransactions: 3 },
    { id: "unit-yaounde-shop", businessId: "business-grocery", name: "Yaounde Market Desk", type: "sales_desk", location: "Mokolo, Yaounde", status: "active", todayRevenue: 86200, queuedTransactions: 1 },
    { id: "unit-electronics-showroom", businessId: "business-electronics", name: "Bonapriso Showroom", type: "shop", location: "Bonapriso, Douala", status: "active", todayRevenue: 338000, queuedTransactions: 0 },
    { id: "unit-electronics-warehouse", businessId: "business-electronics", name: "Logistics Warehouse", type: "warehouse", location: "Bassa Industrial Zone", status: "active", todayRevenue: 0, queuedTransactions: 0 },
  ],
  customers: [
    { id: "customer-divine-stores", name: "Divine Stores", contact: "+237 699 120 448", businessId: "business-electronics", lastPurchaseAt: "2026-06-10T09:20:00Z", lastPaymentAt: "2026-06-08T14:25:00Z", paymentDate: "2026-06-14", totalSpent: 510000, pendingBalance: 35000 },
    { id: "customer-nexus-repairs", name: "Nexus Repairs", contact: "+237 677 902 118", businessId: "business-electronics", lastPurchaseAt: "2026-06-10T11:05:00Z", lastPaymentAt: "2026-06-10T11:05:00Z", totalSpent: 382000, pendingBalance: 0 },
    { id: "customer-mama-grace", name: "Mama Grace Restaurant", contact: "+237 655 441 010", businessId: "business-grocery", lastPurchaseAt: "2026-06-09T15:12:00Z", lastPaymentAt: "2026-06-05T12:10:00Z", totalSpent: 214500, pendingBalance: 18500 },
    { id: "customer-bella-market", name: "Bella Market", contact: "+237 620 774 302", businessId: "business-grocery", lastPurchaseAt: "2026-06-08T13:40:00Z", lastPaymentAt: "2026-06-08T13:40:00Z", totalSpent: 148000, pendingBalance: 7500 },
  ],
  products: [
    {
      id: "product-rice-bag-25kg",
      name: "Rice bag",
      sku: "GRC-RICE-25",
      category: "Groceries",
      businessId: "business-grocery",
      manufacturer: "CamGrain Foods",
      brand: "Mbam Select",
      variant: "Long grain",
      packageSize: "25 kg",
      unitOfMeasure: "bag",
      barcode: "2370001000251",
      availableQuantity: 120,
      lowStockThreshold: 15,
      expiryDate: "2027-02-28",
      costPrice: 21000,
      defaultPrice: 25000,
      timesSold: 42,
      lastSoldAt: "2026-06-09T15:12:00Z",
      customerPrices: [{ customerId: "customer-mama-grace", price: 23500, lastSoldAt: "2026-06-09T15:12:00Z" }],
    },
    {
      id: "product-rice-bag-50kg",
      name: "Rice bag",
      sku: "GRC-RICE-50",
      category: "Groceries",
      businessId: "business-grocery",
      manufacturer: "Sahel Mills",
      brand: "Sahel Gold",
      variant: "Parboiled",
      packageSize: "50 kg",
      unitOfMeasure: "bag",
      barcode: "2370001000503",
      availableQuantity: 35,
      lowStockThreshold: 8,
      expiryDate: "2027-01-31",
      costPrice: 43000,
      defaultPrice: 48500,
      timesSold: 21,
      lastSoldAt: "2026-06-08T12:18:00Z",
    },
    {
      id: "product-oil-bottle-5l",
      name: "Cooking oil",
      sku: "GRC-OIL-5L",
      category: "Groceries",
      businessId: "business-grocery",
      manufacturer: "PalmCo Cameroon",
      brand: "PalmCo",
      packageSize: "5 L",
      unitOfMeasure: "bottle",
      barcode: "2370002000059",
      availableQuantity: 18,
      lowStockThreshold: 12,
      expiryDate: "2026-12-15",
      costPrice: 5200,
      defaultPrice: 6500,
      timesSold: 35,
      lastSoldAt: "2026-06-08T13:40:00Z",
      customerPrices: [{ customerId: "customer-bella-market", price: 6200, lastSoldAt: "2026-06-08T13:40:00Z" }],
    },
    {
      id: "product-oil-bottle-1l",
      name: "Cooking oil",
      sku: "GRC-OIL-1L",
      category: "Groceries",
      businessId: "business-grocery",
      manufacturer: "PalmCo Cameroon",
      brand: "PalmCo",
      packageSize: "1 L",
      unitOfMeasure: "bottle",
      barcode: "2370002000011",
      availableQuantity: 90,
      lowStockThreshold: 20,
      expiryDate: "2026-12-15",
      costPrice: 1100,
      defaultPrice: 1450,
      timesSold: 57,
      lastSoldAt: "2026-06-10T08:35:00Z",
    },
    {
      id: "product-sugar-carton",
      name: "Sugar carton",
      sku: "GRC-SUGAR-CTN",
      category: "Groceries",
      businessId: "business-grocery",
      manufacturer: "SOSUCAM",
      brand: "Princesse Tatie",
      packageSize: "20 x 1 kg",
      unitOfMeasure: "carton",
      barcode: "2370003000208",
      availableQuantity: 12,
      lowStockThreshold: 10,
      expiryDate: "2027-03-10",
      costPrice: 15000,
      defaultPrice: 18000,
      timesSold: 18,
      lastSoldAt: "2026-06-07T10:30:00Z",
    },
    {
      id: "product-bluetooth-speaker",
      name: "Bluetooth speaker",
      sku: "ELC-SPK-BT",
      category: "Electronics",
      businessId: "business-electronics",
      manufacturer: "Shenzhen AudioWorks",
      brand: "AudoMax",
      variant: "Portable waterproof",
      unitOfMeasure: "piece",
      barcode: "6930004001125",
      availableQuantity: 9,
      lowStockThreshold: 5,
      costPrice: 36500,
      defaultPrice: 45000,
      timesSold: 12,
      lastSoldAt: "2026-06-10T09:20:00Z",
      customerPrices: [{ customerId: "customer-divine-stores", price: 42000, lastSoldAt: "2026-06-10T09:20:00Z" }],
    },
    {
      id: "product-phone-charger",
      name: "Fast phone charger",
      sku: "ELC-CHG-FAST",
      category: "Electronics",
      businessId: "business-electronics",
      manufacturer: "Anker Innovations",
      brand: "Anker",
      variant: "USB-C 30W",
      unitOfMeasure: "piece",
      barcode: "6930005000302",
      availableQuantity: 70,
      lowStockThreshold: 15,
      costPrice: 8200,
      defaultPrice: 12000,
      timesSold: 64,
      lastSoldAt: "2026-06-10T11:05:00Z",
      customerPrices: [{ customerId: "customer-nexus-repairs", price: 10500, lastSoldAt: "2026-06-10T11:05:00Z" }],
    },
  ],
  transactions: [
    { id: "txn-001", reference: "MBM-2401", businessId: "business-grocery", businessUnitId: "unit-douala-shop", customerName: "Walk-in customer", itemCount: 6, amount: 18500, paymentMethod: "cash", status: "completed", createdAt: "2026-06-10T08:35:00Z", recordedBy: "Marie Ngono" },
    { id: "txn-002", reference: "MBM-2402", businessId: "business-electronics", businessUnitId: "unit-electronics-showroom", customerName: "Divine Stores", itemCount: 2, amount: 210000, paymentMethod: "mobile_money", status: "completed", createdAt: "2026-06-10T09:20:00Z", recordedBy: "Paul Tabi" },
    { id: "txn-003", reference: "MBM-2403", businessId: "business-grocery", businessUnitId: "unit-yaounde-shop", customerName: "Bella Market", itemCount: 4, amount: 12200, paymentMethod: "cash", status: "queued", createdAt: "2026-06-10T10:10:00Z", recordedBy: "Clarisse Mballa" },
    { id: "txn-004", reference: "MBM-2404", businessId: "business-electronics", businessUnitId: "unit-electronics-showroom", customerName: "Nexus Repairs", itemCount: 1, amount: 128000, paymentMethod: "bank_transfer", status: "completed", createdAt: "2026-06-10T11:05:00Z", recordedBy: "Paul Tabi" },
    { id: "txn-005", reference: "MBM-2398", businessId: "business-grocery", businessUnitId: "unit-douala-shop", customerName: "Mama Grace Restaurant", itemCount: 3, amount: 70500, paymentMethod: "cash", status: "completed", createdAt: "2026-06-09T15:12:00Z", recordedBy: "Marie Ngono" },
  ],
  pendingPayments: [
    { id: "pending-001", reference: "MBM-2402-P1", customerId: "customer-divine-stores", businessId: "business-electronics", businessUnitId: "unit-electronics-showroom", originalAmount: 210000, amountPaid: 175000, outstandingAmount: 35000, paymentMethod: "mobile_money", createdAt: "2026-06-10T09:20:00Z", lastPaymentAt: "2026-06-08T14:25:00Z", paymentDate: "2026-06-14", recordedBy: "Paul Tabi", note: "Remaining balance for Bluetooth speakers." },
    { id: "pending-002", reference: "MBM-2398-P1", customerId: "customer-mama-grace", businessId: "business-grocery", businessUnitId: "unit-douala-shop", originalAmount: 70500, amountPaid: 52000, outstandingAmount: 18500, paymentMethod: "cash", createdAt: "2026-06-09T15:12:00Z", lastPaymentAt: "2026-06-05T12:10:00Z", recordedBy: "Marie Ngono", note: "Customer promised to clear balance after weekend sales." },
    { id: "pending-003", reference: "MBM-2399-P1", customerId: "customer-bella-market", businessId: "business-grocery", businessUnitId: "unit-yaounde-shop", originalAmount: 48000, amountPaid: 40500, outstandingAmount: 7500, paymentMethod: "mobile_money", createdAt: "2026-06-08T13:40:00Z", lastPaymentAt: "2026-06-08T13:40:00Z", paymentDate: "2026-06-12", recordedBy: "Clarisse Mballa", note: "Follow up on Friday morning." },
  ],
  roles: [
    { id: "role-master-owner", name: "Master Owner", permissions: ["All businesses", "All shops", "Roles", "Reports", "Settings"] },
    { id: "role-business-admin", name: "Business Admin", permissions: ["Manage one business", "Invite workers", "View reports"] },
    { id: "role-shop-manager", name: "Shop Manager", permissions: ["Manage one shop", "Record sales", "View shop reports"] },
    { id: "role-cashier", name: "Cashier", permissions: ["Record sales", "View own transactions"] },
  ],
  teamMembers: [
    { id: "member-godwill", fullName: "Godwill Acho", email: "godwill@example.com", roleId: "role-master-owner", scopeLevel: "master", status: "active" },
    { id: "member-marie", fullName: "Marie Ngono", email: "marie@example.com", roleId: "role-shop-manager", scopeLevel: "unit", businessId: "business-grocery", businessUnitId: "unit-douala-shop", status: "active" },
    { id: "member-paul", fullName: "Paul Tabi", email: "paul@example.com", roleId: "role-business-admin", scopeLevel: "business", businessId: "business-electronics", status: "active" },
    { id: "member-clarisse", fullName: "Clarisse Mballa", email: "clarisse@example.com", roleId: "role-cashier", scopeLevel: "unit", businessId: "business-grocery", businessUnitId: "unit-yaounde-shop", status: "invited" },
  ],
};

export const WORKSPACE_CHANGE_EVENT = "mbam-workspace-change";

export const workspace: WorkspaceData = JSON.parse(
  JSON.stringify(demoWorkspace),
) as WorkspaceData;

function notifyWorkspaceChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WORKSPACE_CHANGE_EVENT));
  }
}

export function isDemoWorkspace(): boolean {
  return workspace.masterAccount.id === demoWorkspace.masterAccount.id;
}

export function activateCloudWorkspace(user: AuthUser): void {
  workspace.masterAccount = {
    id: user.id,
    name: "",
    ownerName: user.fullName,
    currency: "XAF",
  };
  workspace.businesses = [];
  workspace.businessUnits = [];
  workspace.customers = [];
  workspace.products = [];
  workspace.transactions = [];
  workspace.pendingPayments = [];
  workspace.roles = [
    {
      id: "role-master-owner",
      name: "Master Owner",
      permissions: ["All businesses", "All shops", "Roles", "Reports", "Settings"],
    },
  ];
  workspace.teamMembers = [
    {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roleId: "role-master-owner",
      scopeLevel: "master",
      status: "active",
    },
  ];
  notifyWorkspaceChanged();
}

export function updateCloudWorkspace(
  updates: Partial<Omit<WorkspaceData, "masterAccount">> & {
    masterAccount?: Partial<WorkspaceData["masterAccount"]>;
  },
): void {
  if (updates.masterAccount) {
    workspace.masterAccount = {
      ...workspace.masterAccount,
      ...updates.masterAccount,
    };
  }
  if (updates.businesses) workspace.businesses = updates.businesses;
  if (updates.businessUnits) workspace.businessUnits = updates.businessUnits;
  if (updates.customers) workspace.customers = updates.customers;
  if (updates.products) workspace.products = updates.products;
  if (updates.transactions) workspace.transactions = updates.transactions;
  if (updates.pendingPayments) workspace.pendingPayments = updates.pendingPayments;
  if (updates.roles) workspace.roles = updates.roles;
  if (updates.teamMembers) workspace.teamMembers = updates.teamMembers;
  notifyWorkspaceChanged();
}
