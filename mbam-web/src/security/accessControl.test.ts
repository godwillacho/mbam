import { describe, expect, it } from "vitest";
import type { TeamMember } from "../types/workspace";
import { canManageProducts } from "./accessControl";

function member(roleId: string): TeamMember {
  return {
    id: roleId,
    fullName: "Test user",
    email: "test@example.com",
    roleId,
    scopeLevel: "master",
    status: "active",
  };
}

describe("product management access", () => {
  it.each([
    "role-master-owner",
    "role-business-admin",
    "role-shop-manager",
  ])("allows %s to manage products", (roleId) => {
    expect(canManageProducts(member(roleId))).toBe(true);
  });

  it("keeps product writes hidden from cashiers", () => {
    expect(canManageProducts(member("role-cashier"))).toBe(false);
  });
});
