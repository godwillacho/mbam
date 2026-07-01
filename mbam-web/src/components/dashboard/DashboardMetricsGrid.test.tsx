// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardMetricsGrid from "./DashboardMetricsGrid";
import type { MetricDefinition } from "./MetricCell";
import type { DashboardSummary } from "../../services/reportService";

vi.mock("../charts/AuthorizedLineChart", () => ({
  default: ({ label }: { label: string }) => <div>{label} chart</div>,
}));

const definitions: MetricDefinition[] = [
  { key: "shop", label: "My shop sales", fallbackPath: "/shops", routeKey: "shops" },
  {
    key: "product",
    label: "My most-sold product",
    fallbackPath: "/products",
    routeKey: "products",
    quantity: true,
  },
];

const summary: DashboardSummary = {
  shop: {
    entity_id: "unit-1",
    entity_name: "Dashboard Test Shop One",
    primary_value: 25000,
    secondary_value: 0,
    detail_path: "/shops?selected=unit-1",
    points: [],
  },
};

describe("DashboardMetricsGrid without a configured Plasmic project", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the original hardcoded metric cards unchanged", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <DashboardMetricsGrid currency="XAF" definitions={definitions} summary={summary} />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector(".metrics-grid.dashboard-leader-grid")).not.toBeNull();
    expect(container.textContent).toContain("My shop sales");
    expect(container.textContent).toContain("Dashboard Test Shop One");
    expect(container.textContent).toContain("My most-sold product");
    expect(container.textContent).toContain("No authorized activity");
  });
});
