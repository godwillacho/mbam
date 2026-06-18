import { productSales } from "../data/mockProductSales";
import type { ProductProfile } from "../types/workspace";

type InventoryStatus = "unknown" | "available" | "low" | "out" | "expired";

export interface ProductInventorySnapshot {
  startingQuantity?: number;
  soldQuantity: number;
  availableQuantity?: number;
  lowStockThreshold?: number;
  status: InventoryStatus;
}

function getSoldQuantity(productId: string): number {
  return productSales
    .filter((sale) => sale.productId === productId)
    .reduce((sum, sale) => sum + sale.quantity, 0);
}

export function getProductInventorySnapshot(product: ProductProfile, now = new Date()): ProductInventorySnapshot {
  const soldQuantity = getSoldQuantity(product.id);
  const availableQuantity = typeof product.availableQuantity === "number"
    ? Math.max(product.availableQuantity - soldQuantity, 0)
    : undefined;
  const lowStockThreshold = product.lowStockThreshold;
  const isExpired = product.expiryDate ? new Date(product.expiryDate) < now : false;

  let status: InventoryStatus = "unknown";

  if (isExpired) {
    status = "expired";
  } else if (availableQuantity === undefined) {
    status = "unknown";
  } else if (availableQuantity <= 0) {
    status = "out";
  } else if (typeof lowStockThreshold === "number" && availableQuantity <= lowStockThreshold) {
    status = "low";
  } else {
    status = "available";
  }

  return {
    startingQuantity: product.availableQuantity,
    soldQuantity,
    availableQuantity,
    lowStockThreshold,
    status,
  };
}
