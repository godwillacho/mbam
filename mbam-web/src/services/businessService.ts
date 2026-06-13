import type { Business, BusinessUnit, UnitType } from "../types/workspace";
import { getJson, patchJson, postJson } from "./apiClient";

interface ApiBusiness {
  id: string;
  name: string;
  business_type: string | null;
  country: string | null;
  currency: string;
  status: "active" | "disabled";
}

export interface CreateBusinessPayload {
  name: string;
  businessType?: string;
  country?: string;
  currency: string;
}

interface ApiBusinessUnit {
  id: string;
  businessId: string;
  name: string;
  unitType: UnitType;
  location: string | null;
  status: "active" | "disabled";
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

export async function listBusinesses(): Promise<Business[]> {
  const businesses = await getJson<ApiBusiness[]>("/api/v1/businesses");
  return businesses.map(toBusiness);
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

  return toBusiness(business);
}

function toBusinessUnit(unit: ApiBusinessUnit): BusinessUnit {
  return {
    id: unit.id,
    businessId: unit.businessId,
    name: unit.name,
    type: unit.unitType,
    location: unit.location ?? "",
    status: unit.status,
    todayRevenue: 0,
    queuedTransactions: 0,
  };
}

export async function listBusinessUnits(businessId: string): Promise<BusinessUnit[]> {
  const units = await getJson<ApiBusinessUnit[]>(`/api/v1/businesses/${businessId}/units`);
  return units.map(toBusinessUnit);
}

export async function createBusinessUnit(
  businessId: string,
  payload: BusinessUnitPayload,
): Promise<BusinessUnit> {
  const unit = await postJson<ApiBusinessUnit, {
    name: string;
    unitType: UnitType;
    location?: string;
  }>(`/api/v1/businesses/${businessId}/units`, {
    name: payload.name,
    unitType: payload.unitType,
    location: payload.location || undefined,
  });
  return toBusinessUnit(unit);
}

export async function updateBusinessUnit(
  businessId: string,
  unitId: string,
  payload: BusinessUnitPayload,
): Promise<BusinessUnit> {
  const unit = await patchJson<ApiBusinessUnit, BusinessUnitPayload>(
    `/api/v1/businesses/${businessId}/units/${unitId}`,
    payload,
  );
  return toBusinessUnit(unit);
}
