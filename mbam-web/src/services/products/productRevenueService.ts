import { workspace } from "../../data/mockWorkspace";
import type { TeamMember } from "../../types/workspace";
import { getProductDescriptor } from "../../utils/productDisplay";
import { listAuthorizedProductsOnline } from "./productService";
import { loadReport } from "../reports/reportService";

interface ProductRevenuePricePoint {
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
  businessUnitId?: string;
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
  source: "api";
}

function businessName(id: string): string {
  return workspace.businesses.find((business) => business.id === id)?.name ?? "—";
}

export async function getProductRevenueReport(
  _member: TeamMember,
  noSkuLabel: string,
): Promise<ProductRevenueReport> {
  const [products, report] = await Promise.all([
    listAuthorizedProductsOnline(),
    loadReport("products", { timeframe: "daily" }),
  ]);
  const aggregates = new Map(report.series.map((series) => [series.entity_id, series]));
  return {
    rows: products.map((product) => {
      const aggregate = aggregates.get(product.id);
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku ?? noSkuLabel,
        category: product.category,
        businessId: product.businessId,
        businessUnitId: product.businessUnitId,
        businessName: businessName(product.businessId ?? ""),
        descriptor: getProductDescriptor(product),
        manufacturer: product.manufacturer,
        brand: product.brand,
        variant: product.variant,
        packageSize: product.packageSize,
        unitOfMeasure: product.unitOfMeasure,
        barcode: product.barcode,
        quantitySold: aggregate?.total_quantity ?? 0,
        totalRevenue: aggregate?.total_revenue ?? 0,
        averageUnitPrice:
          aggregate && aggregate.total_quantity > 0
            ? aggregate.total_revenue / aggregate.total_quantity
            : product.defaultPrice,
        latestSoldAt: aggregate?.points[aggregate.points.length - 1]?.bucket_start,
        pricePoints: [],
        availableQuantity: product.availableQuantity,
        lowStockThreshold: product.lowStockThreshold,
        expiryDate: product.expiryDate,
        costPrice: product.costPrice,
        defaultPrice: product.defaultPrice,
        serverVersion: product.serverVersion,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    }),
    source: "api",
  };
}
