import { describe, expect, it } from "vitest";
import {
  authPath,
  dashboardPickerPath,
  routePathname,
  safeNextPath,
} from "./authRedirect";

describe("auth redirect helpers", () => {
  it("keeps protected dashboard and workflow paths as safe return targets", () => {
    expect(safeNextPath("/dashboard/personal")).toBe("/dashboard/personal");
    expect(safeNextPath("/transactions/new?draft=1")).toBe(
      "/transactions/new?draft=1",
    );
  });

  it("rejects public auth routes and protocol-relative paths", () => {
    expect(safeNextPath("/auth")).toBeNull();
    expect(safeNextPath("/dashboard-picker?next=/transactions")).toBeNull();
    expect(safeNextPath("//example.test/dashboard")).toBeNull();
  });

  it("builds encoded redirects for the requested protected path", () => {
    expect(authPath("/transactions/new?draft=1")).toBe(
      "/auth?next=%2Ftransactions%2Fnew%3Fdraft%3D1",
    );
    expect(dashboardPickerPath("/dashboard/personal")).toBe(
      "/dashboard-picker?next=%2Fdashboard%2Fpersonal",
    );
  });

  it("compares authorization paths without query strings or hashes", () => {
    expect(routePathname("/reports?timeframe=weekly#chart")).toBe("/reports");
  });
});
