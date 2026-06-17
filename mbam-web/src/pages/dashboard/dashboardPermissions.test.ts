import { describe, expect, it } from "vitest";
import type { TeamMember } from "../../types/workspace";
import {
  getDashboardMetricsForMember,
  getDashboardMetricsForRole,
  normalizeDashboardView,
} from "./dashboardPermissions";

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "member-1",
    fullName: "Test Cashier",
    email: "cashier@example.com",
    roleId: "role-cashier",
    scopeLevel: "unit",
    businessId: "business-1",
    businessUnitId: "unit-1",
    status: "active",
    ...overrides,
  };
}

describe("dashboard least privilege", () => {
  it("keeps the cashier role baseline free of account-wide metrics", () => {
    const metrics = getDashboardMetricsForRole("role-cashier");

    expect(metrics).toEqual(["ownSales", "ownTransactions"]);
    expect(metrics).not.toContain("totalRevenue");
    expect(metrics).not.toContain("businesses");
    expect(metrics).not.toContain("team");
  });

  it("denies all dashboard metrics when non-master permissions are unavailable", () => {
    expect(getDashboardMetricsForMember(member())).toEqual([]);
  });

  it("allows only the validated system master baseline when assignable role data omits it", () => {
    const master = member({
      roleId: "role-master-owner",
      scopeLevel: "master",
      businessId: undefined,
      businessUnitId: undefined,
    });

    expect(getDashboardMetricsForMember(master)).toEqual(
      getDashboardMetricsForRole("role-master-owner"),
    );
    expect(getDashboardMetricsForMember({ ...master, scopeLevel: "unit" })).toEqual([]);
    expect(getDashboardMetricsForMember({ ...master, status: "disabled" })).toEqual([]);
  });

  it("keeps a cashier on the personal baseline when an elevated view is requested", () => {
    const cashier = member({
      permissions: ["sale.create", "screen.record_transaction"],
    });

    expect(normalizeDashboardView("master", cashier)).toBe("personal");
    expect(normalizeDashboardView("shop", cashier)).toBe("personal");
  });

  it("allows a granted shop view without exposing ungranted shop metrics", () => {
    const seniorCashier = member({
      permissions: ["sale.create", "sale.view", "report.view", "screen.transactions"],
    });

    expect(normalizeDashboardView("shop", seniorCashier)).toBe("shop");
    expect(getDashboardMetricsForMember(seniorCashier, "shop")).toEqual([
      "unitRevenue",
      "queued",
      "pendingCustomers",
      "transactions",
    ]);
    expect(getDashboardMetricsForMember(seniorCashier, "shop")).not.toContain("products");
  });

  it("preserves the baseline encoded in a custom role id", () => {
    const customManager = member({
      roleId: "role-custom-member-shop-manager-123",
      permissions: ["report.view", "screen.reports"],
    });

    expect(normalizeDashboardView("business", customManager)).toBe("shop");
  });
});
