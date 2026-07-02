// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../services/apiClient";
import EntityReportDetailPage from "./EntityReportDetailPage";

const { loadAuthorizationBootstrap, loadReport } = vi.hoisted(() => ({
  loadAuthorizationBootstrap: vi.fn(),
  loadReport: vi.fn(),
}));

vi.mock("../../components/charts/AuthorizedLineChart", () => ({
  default: ({ label }: { label: string }) => <div>{label} chart</div>,
}));

vi.mock("../../components/charts/TimeframeControl", () => ({
  default: () => <div>timeframe control</div>,
}));

vi.mock("../../services/authorizationService", () => ({
  loadAuthorizationBootstrap,
}));

vi.mock("../../services/reportService", () => ({
  loadReport,
}));

vi.mock("../../services/teamService", () => ({
  loadTeamWorkspace: vi.fn(),
}));

vi.mock("../../services/productService", () => ({
  listAuthorizedProductsOnline: vi.fn(),
}));

describe("EntityReportDetailPage authorization", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    loadAuthorizationBootstrap.mockReset();
    loadReport.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows a fail-closed message when a direct entity URL is outside scope", async () => {
    loadAuthorizationBootstrap.mockResolvedValue({
      businesses: [{ id: "business-1", name: "Business One" }],
      business_units: [{ id: "unit-1", business_id: "business-1", name: "Shop One" }],
    });
    loadReport.mockRejectedValueOnce(new ApiClientError("forbidden", 403));

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/shops/unit-1"]}>
          <Routes>
            <Route element={<EntityReportDetailPage kind="shops" />} path="/shops/:entityId" />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("scopedEntityReport.outOfScope");
    expect(container.textContent).not.toContain("Shop One chart");
  });
});
