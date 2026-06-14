import { describe, expect, it } from "vitest";
import type { TeamMember } from "../types/workspace";
import { canAccessRoute, canManageProducts } from "./accessControl";

function member(roleId: string, permissions?: string[]): TeamMember {
  return {
    id: roleId,
    fullName: "Test user",
    email: "test@example.com",
    roleId,
    permissions,
    scopeLevel: "master",
    status: "active",
  };
}

describe("product management access", () => {
  it.each(["role-master-owner", "role-business-admin", "role-shop-manager"])(
    "allows %s to manage products",
    (roleId) => {
      expect(canManageProducts(member(roleId))).toBe(true);
    },
  );

  it("keeps product writes hidden from cashiers", () => {
    expect(canManageProducts(member("role-cashier"))).toBe(false);
  });

  it("keeps product writes hidden for a custom view-only grant", () => {
    expect(
      canManageProducts(
        member("role-custom", ["screen.products", "product.view"]),
      ),
    ).toBe(false);
  });

  it("allows product writes when a custom role includes update access", () => {
    expect(
      canManageProducts(
        member("role-custom", [
          "screen.products",
          "product.view",
          "product.update",
        ]),
      ),
    ).toBe(true);
  });
});

describe("custom screen access", () => {
  it("allows only explicitly granted screens", () => {
    const customMember = member("role-custom", [
      "screen.transactions",
      "sale.view",
    ]);

    expect(canAccessRoute(customMember, "transactions")).toBe(true);
    expect(canAccessRoute(customMember, "reports")).toBe(false);
  });

  it("retains the standard-role fallback for demo accounts", () => {
    expect(canAccessRoute(member("role-cashier"), "recordTransaction")).toBe(
      true,
    );
    expect(canAccessRoute(member("role-cashier"), "reports")).toBe(false);
  });
});
