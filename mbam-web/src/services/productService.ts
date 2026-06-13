import type { ProductProfile } from "../types/workspace";
import { decryptJson, encryptJson } from "./encryptionService";
import {
  getEncryptedEntitiesByType,
  putEncryptedEntity,
} from "./offlineDatabase";
import { getValidOfflineGrant } from "./offlineSessionService";
import { queueOfflineOperation } from "./offlineSyncService";
import {
  isOfflineVaultUnlocked,
  requireOfflineDataKey,
} from "./offlineVaultService";
import {
  ApiClientError,
  deleteJson,
  getJson,
  isApiConfigured,
  patchJson,
  postJson,
} from "./apiClient";

export interface ProductWritePayload {
  id?: string;
  businessId: string;
  name: string;
  sku?: string;
  category?: string;
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
  defaultPrice?: number;
}

interface ApiProduct extends ProductWritePayload {
  id: string;
  category: string;
  defaultPrice: number;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogueResult {
  products: ProductProfile[];
  source: "api" | "cache" | "fallback";
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function canQueueAfter(error: unknown): boolean {
  return !(error instanceof ApiClientError) || error.status === 0 || error.status >= 500;
}

function toProfile(product: ApiProduct): ProductProfile {
  return {
    ...product,
    timesSold: 0,
    serverVersion: Date.parse(product.updatedAt),
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toApiProduct(profile: ProductProfile): ApiProduct {
  const now = new Date().toISOString();
  return {
    id: profile.id,
    businessId: profile.businessId ?? "",
    name: profile.name,
    sku: profile.sku,
    category: profile.category,
    manufacturer: profile.manufacturer,
    brand: profile.brand,
    variant: profile.variant,
    packageSize: profile.packageSize,
    unitOfMeasure: profile.unitOfMeasure,
    barcode: profile.barcode,
    availableQuantity: profile.availableQuantity,
    lowStockThreshold: profile.lowStockThreshold,
    expiryDate: profile.expiryDate,
    costPrice: profile.costPrice,
    defaultPrice: profile.defaultPrice,
    status: profile.status ?? "active",
    createdAt: profile.createdAt ?? now,
    updatedAt: profile.updatedAt ?? now,
  };
}

async function saveOffline(product: ApiProduct, ownerId: string): Promise<void> {
  if (!isOfflineVaultUnlocked()) return;
  const id = `product:${product.id}`;
  await putEncryptedEntity({
    id,
    ownerId,
    entityType: "product",
    serverVersion: Date.parse(product.updatedAt),
    value: await encryptJson(
      requireOfflineDataKey(),
      product,
      `entity:${id}`,
    ),
    updatedAt: product.updatedAt,
  });
}

async function listOffline(): Promise<ProductProfile[]> {
  if (!isOfflineVaultUnlocked()) return [];
  const records = await getEncryptedEntitiesByType("product");
  const products = await Promise.all(
    records.map((record) =>
      decryptJson<ApiProduct>(
        requireOfflineDataKey(),
        record.value,
        `entity:${record.id}`,
      ),
    ),
  );
  return products
    .filter((product) => product.status === "active")
    .map(toProfile)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function listProducts(
  fallback: ProductProfile[] = [],
): Promise<ProductCatalogueResult> {
  if (isApiConfigured() && isOnline()) {
    try {
      const products = await getJson<ApiProduct[]>("/api/v1/products");
      await Promise.all(products.map((product) => saveOffline(product, "cloud")));
      return { products: products.map(toProfile), source: "api" };
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        throw error;
      }
      // The encrypted catalogue remains available when deployment or network fails.
    }
  }
  const cached = await listOffline();
  return cached.length > 0
    ? { products: cached, source: "cache" }
    : { products: fallback, source: "fallback" };
}

async function queueProductWrite(
  action: "create" | "update" | "delete",
  product: ApiProduct,
  baseVersion?: number,
): Promise<ProductProfile> {
  const grant = await getValidOfflineGrant();
  const requiredPermission =
    action === "create" ? "product.create" : "product.update";
  if (
    !grant ||
    !grant.payload.businessIds.includes(product.businessId) ||
    !grant.payload.permissions.includes(requiredPermission)
  ) {
    throw new Error("offline_product_scope_denied");
  }
  await saveOffline(product, grant.payload.userId);
  await queueOfflineOperation({
    deviceId: grant.payload.deviceId,
    userId: grant.payload.userId,
    businessId: product.businessId,
    entityType: "product",
    entityId: product.id,
    action,
    baseVersion,
    payload: product,
  });
  return toProfile(product);
}

export async function createProducts(
  payloads: ProductWritePayload[],
): Promise<ProductProfile[]> {
  if (payloads.length === 0) return [];
  const identifiedPayloads = payloads.map((payload) => ({
    ...payload,
    id: payload.id ?? crypto.randomUUID(),
  }));
  if (isApiConfigured() && isOnline()) {
    try {
      const products = await postJson<
        ApiProduct[],
        { products: ProductWritePayload[] }
      >("/api/v1/products/bulk", { products: identifiedPayloads });
      await Promise.all(products.map((product) => saveOffline(product, "cloud")));
      return products.map(toProfile);
    } catch (error) {
      if (!canQueueAfter(error)) throw error;
      // Preserve the batch in the encrypted product outbox below.
    }
  }
  const now = new Date().toISOString();
  return Promise.all(
    identifiedPayloads.map((payload) =>
      queueProductWrite("create", {
        ...payload,
        id: payload.id,
        category: payload.category ?? "other",
        defaultPrice: payload.defaultPrice ?? 0,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }),
    ),
  );
}

export async function updateProduct(
  profile: ProductProfile,
  payload: ProductWritePayload,
): Promise<ProductProfile> {
  if (isApiConfigured() && isOnline()) {
    try {
      const product = await patchJson<ApiProduct, ProductWritePayload>(
        `/api/v1/products/${profile.id}`,
        payload,
      );
      await saveOffline(product, "cloud");
      return toProfile(product);
    } catch (error) {
      if (!canQueueAfter(error)) throw error;
      // Queue the edit with its cloud version for conflict detection.
    }
  }
  const product = toApiProduct({
    ...profile,
    ...payload,
    id: profile.id,
    updatedAt: new Date().toISOString(),
  });
  return queueProductWrite("update", product, profile.serverVersion);
}

export async function disableProduct(
  profile: ProductProfile,
): Promise<void> {
  if (isApiConfigured() && isOnline()) {
    try {
      await deleteJson<ApiProduct>(`/api/v1/products/${profile.id}`);
      return;
    } catch (error) {
      if (!canQueueAfter(error)) throw error;
      // Queue the disable below.
    }
  }
  await queueProductWrite(
    "delete",
    { ...toApiProduct(profile), status: "disabled", updatedAt: new Date().toISOString() },
    profile.serverVersion,
  );
}
