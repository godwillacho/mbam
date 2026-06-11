import type { ProductProfile } from "../types/workspace";

export function getProductDescriptor(product: ProductProfile): string {
  return [
    product.brand,
    product.manufacturer && product.manufacturer !== product.brand ? product.manufacturer : undefined,
    product.variant,
    product.packageSize,
    product.unitOfMeasure,
  ].filter(Boolean).join(" · ");
}

export function getProductSearchText(product: ProductProfile): string {
  return [
    product.name,
    product.sku,
    product.category,
    product.manufacturer,
    product.brand,
    product.variant,
    product.packageSize,
    product.unitOfMeasure,
    product.barcode,
  ].filter(Boolean).join(" ").toLowerCase();
}
