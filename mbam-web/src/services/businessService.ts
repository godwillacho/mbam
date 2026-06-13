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

interface ApiBusinessUnit {
  id: string;
  business_id: string;
  name: string;
  unit_type: string;
  location: string | null;
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

export async function listBusinesses(): Promise<Business[]> {
  const businesses = await getJson<ApiBusiness[]>("/api/v1/businesses/");
  return businesses.map(toBusiness);
}

export async function createBusiness(payload: CreateBusinessPayload): Promise<Business> {
  const business = await postJson<ApiBusiness, {
    name: string;
    business_type?: string;
    country?: string;
    currency: string;
  }>("/api/v1/businesses/", {
    name: payload.name,
    business_type: payload.businessType || undefined,
    country: payload.country || undefined,
    currency: payload.currency,
  });

  return toBusiness(business);
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
    unit_type: UnitType;
    location?: string;
  }>(`/api/v1/businesses/${businessId}/units`, {
    name: payload.name,
    unit_type: payload.unitType,
    location: payload.location || undefined,
  });
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
  return toBusinessUnit(unit);
}
