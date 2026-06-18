import { describe, expect, it } from "vitest";
import {
  authorizationBootstrapToTeamWorkspace,
  type AuthorizationBootstrap,
} from "./authorizationService";

function managerBootstrap(): AuthorizationBootstrap {
  return {
    identity: {
      user_id: "user-manager",
      keycloak_subject: "subject-manager",
      full_name: "Shop Manager",
      email: "manager@example.invalid",
    },
    baseline_role: "shop_manager",
    permissions: ["screen.businesses", "screen.team", "screen.products"],
    custom_permissions: [],
    active_membership_ids: ["membership-manager"],
    authorized_business_account_ids: ["account-one"],
    businesses: [{ id: "business-one", name: "Business One" }],
    business_units: [
      { id: "unit-one", business_id: "business-one", name: "Shop One" },
    ],
    dashboard_type: "shop",
    dashboard_path: "/dashboard/shop",
    authorized_routes: [
      { key: "dashboard", path: "/dashboard/shop" },
      { key: "team", path: "/team" },
      { key: "products", path: "/products" },
    ],
    authorization_version: 2,
  };
}

describe("authorizationBootstrapToTeamWorkspace", () => {
  it("preserves only server-authorized navigation routes", () => {
    const workspace = authorizationBootstrapToTeamWorkspace(managerBootstrap());
    const member = workspace.members[0];

    expect(member.authorized_route_keys).toEqual(["dashboard", "team", "products"]);
    expect(member.authorized_route_keys).not.toContain("businesses");
    expect(workspace.dashboard_profiles[0]?.base_dashboard_id).toBe("shop_dashboard");
  });

  it("fails closed when membership or account scope is absent", () => {
    const bootstrap = managerBootstrap();
    bootstrap.active_membership_ids = [];

    expect(() => authorizationBootstrapToTeamWorkspace(bootstrap)).toThrow(
      "authorization_scope_missing",
    );
  });
});
