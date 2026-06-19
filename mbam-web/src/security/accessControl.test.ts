import { describe, expect, it } from "vitest";
import type { TeamMember } from "../types/workspace";
import { canAccessRoute } from "./accessControl";

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "member-1",
    fullName: "Test User",
    email: "user@example.com",
    roleId: "role-cashier",
    scopeLevel: "unit",
    status: "active",
    ...overrides,
  };
}

describe("authorized route matrix", () => {
  it("restricts the Businesses page to master owners and business admins", () => {
    expect(
      canAccessRoute(
        member({ roleId: "role-master-owner", scopeLevel: "master" }),
        "businesses",
      ),
    ).toBe(true);
    expect(
      canAccessRoute(
        member({ roleId: "role-business-admin", scopeLevel: "business" }),
        "businesses",
      ),
    ).toBe(true);
    expect(
      canAccessRoute(member({ roleId: "role-shop-manager" }), "businesses"),
    ).toBe(false);
    expect(canAccessRoute(member(), "businesses")).toBe(false);
  });

  it("allows scoped employees, shops, products, and reports only when the API grants them", () => {
    const scopedManager = member({
      roleId: "role-shop-manager",
      permissions: [
        "screen.team",
        "screen.reports",
        "screen.products",
      ],
    });
    expect(canAccessRoute(scopedManager, "team")).toBe(true);
    expect(canAccessRoute(scopedManager, "shops")).toBe(true);
    expect(canAccessRoute(scopedManager, "products")).toBe(true);
    expect(canAccessRoute(scopedManager, "reports")).toBe(true);

    const cashier = member({
      permissions: ["screen.products", "screen.reports"],
    });
    expect(canAccessRoute(cashier, "products")).toBe(true);
    expect(canAccessRoute(cashier, "shops")).toBe(true);
    expect(canAccessRoute(cashier, "reports")).toBe(true);
    expect(canAccessRoute(cashier, "team")).toBe(false);
  });

  it("keeps custom-role access fail-closed without explicit permissions", () => {
    const custom = member({
      roleId: "role-custom-member-shop-manager-123",
      permissions: ["screen.reports"],
    });
    expect(canAccessRoute(custom, "reports")).toBe(true);
    expect(canAccessRoute(custom, "team")).toBe(false);
    expect(canAccessRoute(custom, "businesses")).toBe(false);
  });
});
