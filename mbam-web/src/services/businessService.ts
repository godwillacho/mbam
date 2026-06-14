import type { Business, BusinessUnit, UnitType } from "../types/workspace";
import { decryptJson, encryptJson } from "./encryptionService";
import {
  getEncryptedEntitiesByType,
  putEncryptedEntity,
} from "./offlineDatabase";
import {
  isOfflineVaultUnlocked,
  requireOfflineDataKey,
} from "./offlineVaultService";
import { getJson, patchJson, postJson } from "./apiClient";

export const BUSINESS_WORKSPACE_CHANGE_EVENT = "mbam-business-workspace-change";

interface ApiBusiness {
  id: string;
  name: string;
  business_type: string | null;
  country: string | null;
  currency: string;
  status: "active" | "disabled";
  updated_at: string;
}

interface ApiBusinessUnit {
  id: string;
  business_id: string;
  name: string;
  unit_type: string;
  location: string | null;
  status: "active" | "disabled";
  updated_at: string;
}

interface CachedBusiness {
  id: string;
  name: string;
  businessType?: string | null;
  country?: string | null;
  currency: string;
  status: "active" | "disabled";
}

interface CachedBusinessUnit {
  id: string;
  businessId: string;
  name: string;
  unitType: string;
  location?: string | null;
  status: "active" | "disabled";
}

export interface CreateBusinessPayload {
  name: string;
  businessType?: string;
  country?: string;
  currency: string;
}

export interface BusinessUnitPayload {
  name: string;
  unitType: UnitType;
  location?: string;
  status?: "active" | "disabled";
}

function toBusiness(business: ApiBusiness): Business {
  return {
    id: business.id,
    name: business.name,
    type: business.business_type ?? "",
    country: business.country ?? "",
    currency: business.currency,
    status: business.status,
  };
}

function cachedToBusiness(business: CachedBusiness): Business {
  return {
    id: business.id,
    name: business.name,
    type: business.businessType ?? "",
    country: business.country ?? "",
    currency: business.currency,
    status: business.status,
  };
}

function toUnitType(value: string): UnitType {
  return value === "warehouse" || value === "sales_desk" ? value : "shop";
}

function toBusinessUnit(unit: ApiBusinessUnit): BusinessUnit {
  return {
    id: unit.id,
    businessId: unit.business_id,
    name: unit.name,
    type: toUnitType(unit.unit_type),
    location: unit.location ?? "",
    status: unit.status,
    todayRevenue: 0,
    queuedTransactions: 0,
  };
}

function cachedToBusinessUnit(unit: CachedBusinessUnit): BusinessUnit {
  return {
    id: unit.id,
    businessId: unit.businessId,
    name: unit.name,
    type: toUnitType(unit.unitType),
    location: unit.location ?? "",
    status: unit.status,
    todayRevenue: 0,
    queuedTransactions: 0,
  };
}

function notifyBusinessWorkspaceChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BUSINESS_WORKSPACE_CHANGE_EVENT));
  }
}

async function cacheEntity(
  entityType: "business" | "business_unit",
  entityId: string,
  value: CachedBusiness | CachedBusinessUnit,
  updatedAt: string,
): Promise<void> {
  if (!isOfflineVaultUnlocked()) return;
  const id = `${entityType}:${entityId}`;
  await putEncryptedEntity({
    id,
    ownerId: "cloud",
    entityType,
    serverVersion: Date.parse(updatedAt),
    value: await encryptJson(requireOfflineDataKey(), value, `entity:${id}`),
    updatedAt,
  });
}

async function listCachedBusinesses(): Promise<Business[]> {
  if (!isOfflineVaultUnlocked()) return [];
  const records = await getEncryptedEntitiesByType("business");
  return Promise.all(
    records.map(async (record) =>
      cachedToBusiness(
        await decryptJson<CachedBusiness>(
          requireOfflineDataKey(),
          record.value,
          `entity:${record.id}`,
        ),
      ),
    ),
  );
}

async function listCachedBusinessUnits(businessId: string): Promise<BusinessUnit[]> {
  if (!isOfflineVaultUnlocked()) return [];
  const records = await getEncryptedEntitiesByType("business_unit");
  const units = await Promise.all(
    records.map(async (record) =>
      cachedToBusinessUnit(
        await decryptJson<CachedBusinessUnit>(
          requireOfflineDataKey(),
          record.value,
          `entity:${record.id}`,
        ),
      ),
    ),
  );
  return units.filter((unit) => unit.businessId === businessId);
}

export async function listBusinesses(): Promise<Business[]> {
  try {
    const businesses = await getJson<ApiBusiness[]>("/api/v1/businesses");
    await Promise.all(
      businesses.map((business) =>
        cacheEntity(
          "business",
          business.id,
          {
            id: business.id,
            name: business.name,
            businessType: business.business_type,
            country: business.country,
            currency: business.currency,
            status: business.status,
          },
          business.updated_at,
        ),
      ),
    );
    return businesses.map(toBusiness);
  } catch (error) {
    const cached = await listCachedBusinesses();
    if (cached.length > 0) return cached;
    throw error;
  }
}

export async function createBusiness(payload: CreateBusinessPayload): Promise<Business> {
  const business = await postJson<ApiBusiness, {
    name: string;
    business_type?: string;
    country?: string;
    currency: string;
  }>("/api/v1/businesses", {
    name: payload.name,
    business_type: payload.businessType || undefined,
    country: payload.country || undefined,
    currency: payload.currency,
  });

  await cacheEntity(
    "business",
    business.id,
    {
      id: business.id,
      name: business.name,
      businessType: business.business_type,
      country: business.country,
      currency: business.currency,
      status: business.status,
    },
    business.updated_at,
  );
  notifyBusinessWorkspaceChanged();
  return toBusiness(business);
}

export async function listBusinessUnits(businessId: string): Promise<BusinessUnit[]> {
  try {
    const units = await getJson<ApiBusinessUnit[]>(`/api/v1/businesses/${businessId}/units`);
    await Promise.all(
      units.map((unit) =>
        cacheEntity(
          "business_unit",
          unit.id,
          {
            id: unit.id,
            businessId: unit.business_id,
            name: unit.name,
            unitType: unit.unit_type,
            location: unit.location,
            status: unit.status,
          },
          unit.updated_at,
        ),
      ),
    );
    return units.map(toBusinessUnit);
  } catch (error) {
    const cached = await listCachedBusinessUnits(businessId);
    if (cached.length > 0) return cached;
    throw error;
  }
}

export async function createBusinessUnit(
  businessId: string,
  payload: BusinessUnitPayload,
): Promise<BusinessUnit> {
  const unit = await postJson<ApiBusinessUnit, {
    name: string;
    unit_type: UnitType;
    location?: string;
  }>(`/api/v1/businesses/${businessId}/units`, {
    name: payload.name,
    unit_type: payload.unitType,
    location: payload.location || undefined,
  });
  await cacheEntity(
    "business_unit",
    unit.id,
    {
      id: unit.id,
      businessId: unit.business_id,
      name: unit.name,
      unitType: unit.unit_type,
      location: unit.location,
      status: unit.status,
    },
    unit.updated_at,
  );
  notifyBusinessWorkspaceChanged();
  return toBusinessUnit(unit);
}

export async function updateBusinessUnit(
  businessId: string,
  unitId: string,
  payload: BusinessUnitPayload,
): Promise<BusinessUnit> {
  const unit = await patchJson<ApiBusinessUnit, {
    name: string;
    unit_type: UnitType;
    location?: string;
    status?: "active" | "disabled";
  }>(`/api/v1/businesses/${businessId}/units/${unitId}`, {
    name: payload.name,
    unit_type: payload.unitType,
    location: payload.location || undefined,
    status: payload.status,
  });
  await cacheEntity(
    "business_unit",
    unit.id,
    {
      id: unit.id,
      businessId: unit.business_id,
      name: unit.name,
      unitType: unit.unit_type,
      location: unit.location,
      status: unit.status,
    },
    unit.updated_at,
  );
  notifyBusinessWorkspaceChanged();
  return toBusinessUnit(unit);
}
