import type { ProductProfile } from "../types/workspace";
import { decryptJson, encryptJson } from "./encryptionService";
import {
  getEncryptedEntitiesByType,
  putEncryptedEntity,
} from "./offlineDatabase";
import { getValidOfflineGrant } from "./offlineSessionService";
import { queueOfflineOperation } from "./offlineSyncService";
import { getDeviceBinding } from "./deviceBindingService";
import {
  isOfflineVaultUnlocked,
  requireOfflineDataKey,
} from "./offlineVaultService";
import {
  ApiClientError,
  getJson,
  isApiConfigured,
  patchJson,
  postJson,
} from "./apiClient";

export interface ProductWritePayload {
  id?: string;
  businessId: string;
  businessUnitId?: string;
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
  businessUnitId: string;
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

function requireProductUnit(payload: ProductWritePayload): ProductWritePayload {
  if (!payload.businessUnitId) {
    throw new Error("product_business_unit_required");
  }
  return payload;
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
  const binding = await getDeviceBinding();
  await saveOffline(product, grant.payload.userId);
  await queueOfflineOperation({
    deviceId: binding.deviceId,
    userId: grant.payload.userId,
    businessId: product.businessId,
    businessUnitId: product.businessUnitId,
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
  const identifiedPayloads = payloads.map((payload) => requireProductUnit({
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
    }
  }
  const now = new Date().toISOString();
  return Promise.all(
    identifiedPayloads.map((payload) => queueProductWrite("create", {
      ...payload,
      id: payload.id ?? crypto.randomUUID(),
      businessUnitId: payload.businessUnitId ?? "",
      category: payload.category ?? "other",
      defaultPrice: payload.defaultPrice ?? 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })),
  );
}

export async function updateProduct(
  id: string,
  payload: ProductWritePayload,
  baseVersion?: number,
): Promise<ProductProfile> {
  const scopedPayload = requireProductUnit(payload);
  if (isApiConfigured() && isOnline()) {
    try {
      const product = await patchJson<ApiProduct, ProductWritePayload>(
        `/api/v1/products/${id}`,
        scopedPayload,
      );
      await saveOffline(product, "cloud");
      return toProfile(product);
    } catch (error) {
      if (!canQueueAfter(error)) throw error;
    }
  }
  const now = new Date().toISOString();
  return queueProductWrite("update", {
    ...scopedPayload,
    id,
    businessUnitId: scopedPayload.businessUnitId ?? "",
    category: scopedPayload.category ?? "other",
    defaultPrice: scopedPayload.defaultPrice ?? 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }, baseVersion);
}
