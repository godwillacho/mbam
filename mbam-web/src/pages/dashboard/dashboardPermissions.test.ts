import { describe, expect, it } from "vitest";
import { getDashboardMetricsForRole } from "./dashboardPermissions";

describe("cashier dashboard permissions", () => {
  it("shows only cashier-scoped metrics", () => {
    expect(getDashboardMetricsForRole("role-cashier")).toEqual([
      "ownSales",
      "ownTransactions",
      "pendingCustomers",
    ]);
  });

  it("does not expose master-account metrics", () => {
    const metrics = getDashboardMetricsForRole("role-cashier");

    expect(metrics).not.toContain("totalRevenue");
    expect(metrics).not.toContain("businesses");
    expect(metrics).not.toContain("team");
  });
});
