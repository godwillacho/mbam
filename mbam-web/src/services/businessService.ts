import type { Business } from "../types/workspace";
import { getJson, postJson } from "./apiClient";

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
