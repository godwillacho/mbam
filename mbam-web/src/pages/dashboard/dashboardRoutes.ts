import type { DashboardProfile } from "../../services/team/teamService";
import type { TeamMember } from "../../types/workspace";
import type { DashboardView } from "./dashboardPermissions";

const dashboardPaths: Record<Exclude<DashboardView, "custom">, string> = {
  master: "/dashboard/master",
  business: "/dashboard/business",
  shop: "/dashboard/shop",
  personal: "/dashboard/personal",
};

function roleBaseline(roleCode: string): Exclude<DashboardView, "custom"> | null {
  const normalized = roleCode.replace(/^role-/, "").replace(/-/g, "_");
  if (normalized === "master_owner" || normalized.includes("master_owner")) return "master";
  if (normalized === "business_admin" || normalized.includes("business_admin")) return "business";
  if (normalized === "shop_manager" || normalized.includes("shop_manager")) return "shop";
  if (normalized === "cashier" || normalized.includes("cashier")) return "personal";
  return null;
}

function dashboardTypeView(value: string): Exclude<DashboardView, "custom"> | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("master")) return "master";
  if (normalized.includes("business")) return "business";
  if (normalized.includes("shop") || normalized.includes("unit")) return "shop";
  if (normalized.includes("personal") || normalized.includes("cashier")) return "personal";
  return null;
}

export function dashboardPathForView(view: Exclude<DashboardView, "custom">): string {
  return dashboardPaths[view];
}

export function baselineDashboardView(member: TeamMember): Exclude<DashboardView, "custom"> | null {
  if (member.status !== "active") return null;
  return roleBaseline(member.roleId);
}

export function baselineDashboardPath(member: TeamMember): string | null {
  const view = baselineDashboardView(member);
  return view ? dashboardPathForView(view) : null;
}

export function profileBaselineDashboardPath(profile: DashboardProfile): string | null {
  const baseline =
    profile.dashboards.find((dashboard) => dashboard.id === profile.base_dashboard_id) ??
    profile.dashboards.find((dashboard) => dashboard.is_baseline);
  if (!baseline) return null;

  const view = dashboardTypeView(baseline.dashboard_type) ?? roleBaseline(profile.role_code);
  if (view) return dashboardPathForView(view);
  return baseline.path.startsWith("/") ? baseline.path : null;
}
