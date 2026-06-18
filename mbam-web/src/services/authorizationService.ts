import { getJson } from "./apiClient";
import type {
  DashboardProfile,
  TeamEmployee,
  TeamRole,
  TeamWorkspace,
} from "./teamService";

export interface AuthorizationIdentity {
  user_id: string;
  keycloak_subject: string | null;
  full_name: string;
  email: string;
}

export interface AuthorizedBusiness {
  id: string;
  name: string;
}

export interface AuthorizedBusinessUnit {
  id: string;
  business_id: string;
  name: string;
}

export interface AuthorizedRoute {
  key: string;
  path: string;
}

export interface AuthorizationBootstrap {
  identity: AuthorizationIdentity;
  baseline_role: "master_owner" | "business_admin" | "shop_manager" | "cashier";
  permissions: string[];
  custom_permissions: string[];
  active_membership_ids: string[];
  authorized_business_account_ids: string[];
  businesses: AuthorizedBusiness[];
  business_units: AuthorizedBusinessUnit[];
  dashboard_type: "master" | "business" | "shop" | "personal";
  dashboard_path: string;
  authorized_routes: AuthorizedRoute[];
  authorization_version: number;
}

const roleNames: Record<AuthorizationBootstrap["baseline_role"], string> = {
  master_owner: "Master Owner",
  business_admin: "Business Admin",
  shop_manager: "Shop Manager",
  cashier: "Cashier",
};

export async function loadAuthorizationBootstrap(): Promise<AuthorizationBootstrap> {
  return getJson<AuthorizationBootstrap>("/api/v1/me/authorization");
}

export function authorizationBootstrapToTeamWorkspace(
  bootstrap: AuthorizationBootstrap,
): TeamWorkspace {
  const membershipId = bootstrap.active_membership_ids[0];
  const businessAccountId = bootstrap.authorized_business_account_ids[0];
  if (!membershipId || !businessAccountId) {
    throw new Error("authorization_scope_missing");
  }

  const roleId = `authorization-role-${bootstrap.baseline_role}`;
  const roleName = roleNames[bootstrap.baseline_role];
  const role: TeamRole = {
    id: roleId,
    code: bootstrap.baseline_role,
    name: roleName,
    permissions: bootstrap.permissions,
  };
  const member: TeamEmployee = {
    id: membershipId,
    user_id: bootstrap.identity.user_id,
    full_name: bootstrap.identity.full_name,
    email: bootstrap.identity.email,
    role_id: roleId,
    role_code: bootstrap.baseline_role,
    role_name: roleName,
    business_account_id: businessAccountId,
    business_id: bootstrap.businesses.length === 1
      ? bootstrap.businesses[0]?.id
      : undefined,
    business_unit_id: bootstrap.business_units.length === 1
      ? bootstrap.business_units[0]?.id
      : undefined,
    authorized_route_keys: bootstrap.authorized_routes.map((route) => route.key),
    status: "active",
    updated_at: new Date().toISOString(),
  };
  const baselineDashboardId = `${bootstrap.dashboard_type}_dashboard`;
  const dashboardProfile: DashboardProfile = {
    membership_id: membershipId,
    user_id: bootstrap.identity.user_id,
    role_code: bootstrap.baseline_role,
    role_name: roleName,
    scope_level: bootstrap.dashboard_type === "master"
      ? "master"
      : bootstrap.dashboard_type === "business"
        ? "business"
        : "unit",
    scope_label: scopeLabel(bootstrap),
    base_dashboard_id: baselineDashboardId,
    permissions: bootstrap.permissions,
    dashboards: [
      {
        id: baselineDashboardId,
        label: `${roleName} dashboard`,
        description: "Validated baseline dashboard",
        path: bootstrap.dashboard_path,
        dashboard_type: bootstrap.dashboard_type,
        route_key: null,
        is_baseline: true,
      },
      ...bootstrap.authorized_routes
        .filter((route) => route.key !== "dashboard")
        .map((route) => ({
          id: route.key,
          label: route.key,
          description: "Validated application route",
          path: route.path,
          dashboard_type: "workflow",
          route_key: route.key,
          is_baseline: false,
        })),
    ],
  };

  return {
    members: [member],
    invitations: [],
    roles: [role],
    businesses: bootstrap.businesses,
    business_units: bootstrap.business_units,
    dashboard_profiles: [dashboardProfile],
    authorization_version: bootstrap.authorization_version,
  };
}

function scopeLabel(bootstrap: AuthorizationBootstrap): string {
  if (bootstrap.business_units.length === 1) {
    const unit = bootstrap.business_units[0];
    const business = bootstrap.businesses.find((item) => item.id === unit.business_id);
    return business ? `${business.name} / ${unit.name}` : unit.name;
  }
  if (bootstrap.businesses.length === 1) return bootstrap.businesses[0]?.name ?? "";
  return `${bootstrap.businesses.length} authorized businesses`;
}
