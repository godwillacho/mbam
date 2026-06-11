import { productSales, type ProductSaleLine } from "../data/mockProductSales";
import { workspace } from "../data/mockWorkspace";
import type { TeamMember } from "../types/workspace";
import { getProductDescriptor } from "../utils/productDisplay";
import { localSyncRead } from "./localSync/localSyncClient";

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
}

export interface ProductRevenueReport {
  rows: ProductRevenueRow[];
  source: "api" | "mock" | "cache";
}

interface ProductRevenueApiResponse {
  rows: ProductRevenueRow[];
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

function buildProductRevenuePath(member: TeamMember): string {
  const params = new URLSearchParams();

  if (member.scopeLevel !== "master") {
    params.set("scopeLevel", member.scopeLevel);
  }
  if (member.businessId) {
    params.set("businessId", member.businessId);
  }
  if (member.businessUnitId) {
    params.set("businessUnitId", member.businessUnitId);
  }
  if (member.roleId === "role-cashier") {
    params.set("recordedBy", member.fullName);
  }

  const query = params.toString();
  return query ? `/api/v1/reports/product-revenue?${query}` : "/api/v1/reports/product-revenue";
}

function getMockReport(member: TeamMember, noSkuLabel: string): ProductRevenueReport {
  return {
    rows: buildMockRevenueRows(member, noSkuLabel),
    source: "mock",
  };
}

export async function getProductRevenueReport(member: TeamMember, noSkuLabel: string): Promise<ProductRevenueReport> {
  const path = buildProductRevenuePath(member);
  const result = await localSyncRead<ProductRevenueApiResponse>({
    module: "reports",
    path,
    fallback: () => ({ rows: getMockReport(member, noSkuLabel).rows }),
  });

  return {
    rows: result.data.rows.sort((a, b) => b.totalRevenue - a.totalRevenue),
    source: result.source === "api" ? "api" : result.source === "cache" ? "cache" : "mock",
  };
}
