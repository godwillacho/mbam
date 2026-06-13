import { productSales, type ProductSaleLine } from "../data/mockProductSales";
import { workspace } from "../data/mockWorkspace";
import type { TeamMember } from "../types/workspace";
import { getProductDescriptor } from "../utils/productDisplay";
import { listProducts } from "./productService";

export interface ProductRevenuePricePoint {
  id: string;
  customerName: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  soldAt: string;
  recordedBy: string;
}

export interface ProductRevenueRow {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  businessName: string;
  descriptor?: string;
  manufacturer?: string;
  brand?: string;
  variant?: string;
  packageSize?: string;
  unitOfMeasure?: string;
  barcode?: string;
  quantitySold: number;
  totalRevenue: number;
  averageUnitPrice: number;
  latestSoldAt?: string;
  pricePoints: ProductRevenuePricePoint[];
  businessId?: string;
  availableQuantity?: number;
  lowStockThreshold?: number;
  expiryDate?: string;
  costPrice?: number;
  defaultPrice?: number;
  serverVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductRevenueReport {
  rows: ProductRevenueRow[];
  source: "api" | "mock" | "cache";
}

function businessName(id: string): string {
  return workspace.businesses.find((business) => business.id === id)?.name ?? "—";
}

function unitName(id: string): string {
  return workspace.businessUnits.find((unit) => unit.id === id)?.name ?? "—";
}

function getScopedUnitIds(member: TeamMember): Set<string> {
  const scopedUnits = workspace.businessUnits.filter((unit) => {
    if (member.scopeLevel === "master") return true;
    if (member.scopeLevel === "business") return unit.businessId === member.businessId;
    return unit.id === member.businessUnitId;
  });

  return new Set(scopedUnits.map((unit) => unit.id));
}

function getMockScopedSales(member: TeamMember): ProductSaleLine[] {
  const scopedUnitIds = getScopedUnitIds(member);
  const visibleSales = productSales.filter((sale) => scopedUnitIds.has(sale.businessUnitId));

  if (member.roleId === "role-cashier") {
    return visibleSales.filter((sale) => sale.recordedBy === member.fullName);
  }

  return visibleSales;
}

function buildMockRevenueRows(member: TeamMember, noSkuLabel: string): ProductRevenueRow[] {
  return Array.from(getMockScopedSales(member).reduce<Map<string, ProductRevenueRow>>((map, sale) => {
    const product = workspace.products.find((item) => item.id === sale.productId);
    if (!product) return map;

    const existing = map.get(sale.productId) ?? {
      productId: sale.productId,
      productName: product.name,
      sku: product.sku ?? noSkuLabel,
      category: product.category,
      businessName: businessName(sale.businessId),
      descriptor: getProductDescriptor(product),
      manufacturer: product.manufacturer,
      brand: product.brand,
      variant: product.variant,
      packageSize: product.packageSize,
      unitOfMeasure: product.unitOfMeasure,
      barcode: product.barcode,
      quantitySold: 0,
      totalRevenue: 0,
      averageUnitPrice: 0,
      latestSoldAt: undefined,
      pricePoints: [],
    };

    const lineTotal = sale.quantity * sale.unitPrice;
    existing.quantitySold += sale.quantity;
    existing.totalRevenue += lineTotal;
    existing.averageUnitPrice = existing.totalRevenue / Math.max(existing.quantitySold, 1);
    existing.latestSoldAt = !existing.latestSoldAt || sale.soldAt > existing.latestSoldAt ? sale.soldAt : existing.latestSoldAt;
    existing.pricePoints.push({
      id: sale.id,
      customerName: sale.customerName,
      unitName: unitName(sale.businessUnitId),
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      total: lineTotal,
      soldAt: sale.soldAt,
      recordedBy: sale.recordedBy,
    });

    map.set(sale.productId, existing);
    return map;
  }, new Map()).values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function getMockReport(member: TeamMember, noSkuLabel: string): ProductRevenueReport {
  return {
    rows: buildMockRevenueRows(member, noSkuLabel),
    source: "mock",
  };
}

export async function getProductRevenueReport(member: TeamMember, noSkuLabel: string): Promise<ProductRevenueReport> {
  const catalogue = await listProducts(workspace.products);
  if (catalogue.source === "fallback") {
    return getMockReport(member, noSkuLabel);
  }
  return {
    rows: catalogue.products.map((product) => ({
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? noSkuLabel,
      category: product.category,
      businessId: product.businessId,
      businessName: businessName(product.businessId ?? ""),
      descriptor: getProductDescriptor(product),
      manufacturer: product.manufacturer,
      brand: product.brand,
      variant: product.variant,
      packageSize: product.packageSize,
      unitOfMeasure: product.unitOfMeasure,
      barcode: product.barcode,
      quantitySold: product.timesSold,
      totalRevenue: 0,
      averageUnitPrice: product.defaultPrice,
      latestSoldAt: product.lastSoldAt,
      pricePoints: [],
      availableQuantity: product.availableQuantity,
      lowStockThreshold: product.lowStockThreshold,
      expiryDate: product.expiryDate,
      costPrice: product.costPrice,
      defaultPrice: product.defaultPrice,
      serverVersion: product.serverVersion,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    })),
    source: catalogue.source === "api" ? "api" : "cache",
  };
}
