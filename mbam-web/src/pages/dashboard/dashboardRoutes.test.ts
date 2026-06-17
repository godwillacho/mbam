import { describe, expect, it } from "vitest";
import type { DashboardProfile } from "../../services/teamService";
import type { TeamMember } from "../../types/workspace";
import {
  baselineDashboardPath,
  profileBaselineDashboardPath,
} from "./dashboardRoutes";

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    id: "member-1",
    fullName: "Test user",
    email: "test@mbam.local",
    roleId: "role-no-access",
    scopeLevel: "unit",
    status: "active",
    ...overrides,
  };
}

function profile(overrides: Partial<DashboardProfile>): DashboardProfile {
  return {
    membership_id: "membership-1",
    user_id: "user-1",
    role_code: "cashier",
    role_name: "Cashier",
    scope_level: "unit",
    scope_label: "Shop One",
    base_dashboard_id: "baseline",
    permissions: [],
    dashboards: [{
      id: "baseline",
      label: "Personal dashboard",
      description: "Cashier baseline",
      path: "/dashboard?view=personal",
      dashboard_type: "personal",
      route_key: null,
      is_baseline: true,
    }],
    ...overrides,
  };
}

describe("baseline dashboard routing", () => {
  it("routes each system role to its fixed baseline UI", () => {
    expect(baselineDashboardPath(member({ roleId: "role-master-owner", scopeLevel: "master" }))).toBe("/dashboard/master");
    expect(baselineDashboardPath(member({ roleId: "role-business-admin", scopeLevel: "business" }))).toBe("/dashboard/business");
    expect(baselineDashboardPath(member({ roleId: "role-shop-manager" }))).toBe("/dashboard/shop");
    expect(baselineDashboardPath(member({ roleId: "role-cashier" }))).toBe("/dashboard/personal");
  });

  it("does not infer unit-level access for an unknown role", () => {
    expect(baselineDashboardPath(member({ roleId: "role-unknown", scopeLevel: "unit" }))).toBeNull();
  });

  it("uses only an API-provided baseline dashboard", () => {
    expect(profileBaselineDashboardPath(profile({}))).toBe("/dashboard/personal");
    expect(profileBaselineDashboardPath(profile({ base_dashboard_id: "missing", dashboards: [] }))).toBeNull();
  });

  it("maps a custom cashier baseline to the personal dashboard", () => {
    expect(profileBaselineDashboardPath(profile({ role_code: "custom_member_cashier_senior" }))).toBe("/dashboard/personal");
  });
});
