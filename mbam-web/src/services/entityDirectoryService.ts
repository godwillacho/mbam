import { loadAuthorizationBootstrap } from "./authorizationService";
import { listAuthorizedProductsOnline } from "./productService";
import { loadTeamWorkspace } from "./teamService";

/**
 * The four reporting dimensions an entity picker can list and search across.
 * Distinct from `ReportDimension` (reportService.ts) only in that it's the
 * vocabulary for "which directory of things does the user pick from", not
 * "which aggregate chart is showing" -- the two happen to share the same
 * four values today.
 */
export type EntityKind = "businesses" | "shops" | "employees" | "products";

export interface EntityItem {
  id: string;
  name: string;
  description: string;
}

/**
 * Loads the authorized directory of entities for one dimension, for use by
 * both `EntityReportDetailPage` (single-entity per-page charts) and the
 * multi-select entity picker on `ReportsPage`'s Detail view. Every call is
 * scoped by the API to whatever the current user is authorized to see, so
 * the returned list is already safe to render and to build filters from.
 */
export async function loadEntityItems(kind: EntityKind): Promise<EntityItem[]> {
  if (kind === "businesses") {
    const bootstrap = await loadAuthorizationBootstrap();
    return bootstrap.businesses.map((business) => ({
      id: business.id,
      name: business.name,
      description: "",
    }));
  }
  if (kind === "shops") {
    const bootstrap = await loadAuthorizationBootstrap();
    return bootstrap.business_units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      description:
        bootstrap.businesses.find((business) => business.id === unit.business_id)
          ?.name ?? "",
    }));
  }
  if (kind === "employees") {
    const team = await loadTeamWorkspace();
    return team.members.map((member) => ({
      id: member.user_id,
      name: member.full_name,
      description: member.role_name,
    }));
  }
  return (await listAuthorizedProductsOnline()).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.sku ?? product.category,
  }));
}
