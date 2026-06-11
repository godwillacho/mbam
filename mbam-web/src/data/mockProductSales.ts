export interface ProductSaleLine {
  id: string;
  productId: string;
  businessId: string;
  businessUnitId: string;
  customerId?: string;
  customerName: string;
  quantity: number;
  unitPrice: number;
  soldAt: string;
  recordedBy: string;
}

export const productSales: ProductSaleLine[] = [
  {
    id: "line-001",
    productId: "product-bluetooth-speaker",
    businessId: "business-electronics",
    businessUnitId: "unit-electronics-showroom",
    customerId: "customer-divine-stores",
    customerName: "Divine Stores",
    quantity: 5,
    unitPrice: 42000,
    soldAt: "2026-06-10T09:20:00Z",
    recordedBy: "Paul Tabi",
  },
  {
    id: "line-002",
    productId: "product-phone-charger",
    businessId: "business-electronics",
    businessUnitId: "unit-electronics-showroom",
    customerId: "customer-nexus-repairs",
    customerName: "Nexus Repairs",
    quantity: 12,
    unitPrice: 10500,
    soldAt: "2026-06-10T11:05:00Z",
    recordedBy: "Paul Tabi",
  },
  {
    id: "line-003",
    productId: "product-rice-bag-25kg",
    businessId: "business-grocery",
    businessUnitId: "unit-douala-shop",
    customerId: "customer-mama-grace",
    customerName: "Mama Grace Restaurant",
    quantity: 3,
    unitPrice: 23500,
    soldAt: "2026-06-09T15:12:00Z",
    recordedBy: "Marie Ngono",
  },
  {
    id: "line-004",
    productId: "product-oil-bottle-5l",
    businessId: "business-grocery",
    businessUnitId: "unit-yaounde-shop",
    customerId: "customer-bella-market",
    customerName: "Bella Market",
    quantity: 2,
    unitPrice: 6200,
    soldAt: "2026-06-10T10:10:00Z",
    recordedBy: "Clarisse Mballa",
  },
  {
    id: "line-005",
    productId: "product-sugar-carton",
    businessId: "business-grocery",
    businessUnitId: "unit-douala-shop",
    customerName: "Walk-in customer",
    quantity: 1,
    unitPrice: 18000,
    soldAt: "2026-06-10T08:35:00Z",
    recordedBy: "Marie Ngono",
  },
  {
    id: "line-006",
    productId: "product-oil-bottle-5l",
    businessId: "business-grocery",
    businessUnitId: "unit-douala-shop",
    customerName: "Walk-in customer",
    quantity: 4,
    unitPrice: 6500,
    soldAt: "2026-06-10T08:35:00Z",
    recordedBy: "Marie Ngono",
  },
];
