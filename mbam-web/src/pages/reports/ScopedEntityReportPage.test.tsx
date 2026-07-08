// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScopedEntityReportPage from "./ScopedEntityReportPage";

const { loadAuthorizationBootstrap, getScopedUnits } = vi.hoisted(() => ({
  loadAuthorizationBootstrap: vi.fn(),
  getScopedUnits: vi.fn(),
}));

vi.mock("../../routing/accessControl", () => ({
  canManageProducts: vi.fn(() => false),
  getCurrentMember: vi.fn(() => ({
    roleId: "role-shop-manager",
  })),
  getScopedUnits,
}));

vi.mock("../../auth/authorizationService", () => ({
  loadAuthorizationBootstrap,
}));

vi.mock("../../services/team/teamService", () => ({
  loadTeamWorkspace: vi.fn(),
}));

vi.mock("../../services/products/productService", () => ({
  listAuthorizedProductsOnline: vi.fn(),
}));

describe("ScopedEntityReportPage list", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    loadAuthorizationBootstrap.mockReset();
    getScopedUnits.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders each authorized entity as a link to its own detail page instead of an inline chart", async () => {
    getScopedUnits.mockReturnValue([
      { id: "unit-1", name: "Shop One" },
      { id: "unit-2", name: "Shop Two" },
    ]);
    loadAuthorizationBootstrap.mockResolvedValue({
      businesses: [{ id: "business-1", name: "Business One" }],
      business_units: [{ id: "unit-1", business_id: "business-1", name: "Shop One" }],
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/shops"]}>
          <ScopedEntityReportPage kind="shops" />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Shop One");
    const link = container.querySelector('a[href="/shops/unit-1"]');
    expect(link).not.toBeNull();
    expect(container.querySelector(".scoped-chart-panel")).toBeNull();
  });

  it("shows the single assigned shop's name instead of a generic label when scoped to one shop", async () => {
    getScopedUnits.mockReturnValue([{ id: "unit-1", name: "Only Shop" }]);
    loadAuthorizationBootstrap.mockResolvedValue({
      businesses: [{ id: "business-1", name: "Business One" }],
      business_units: [{ id: "unit-1", business_id: "business-1", name: "Only Shop" }],
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/shops"]}>
          <ScopedEntityReportPage kind="shops" />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const heading = container.querySelector(".scoped-entity-heading h2");
    expect(heading?.textContent).toBe("Only Shop");
  });

  it("shows the generic feature label when scoped to more than one shop", async () => {
    getScopedUnits.mockReturnValue([
      { id: "unit-1", name: "Shop One" },
      { id: "unit-2", name: "Shop Two" },
    ]);
    loadAuthorizationBootstrap.mockResolvedValue({
      businesses: [{ id: "business-1", name: "Business One" }],
      business_units: [
        { id: "unit-1", business_id: "business-1", name: "Shop One" },
        { id: "unit-2", business_id: "business-1", name: "Shop Two" },
      ],
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/shops"]}>
          <ScopedEntityReportPage kind="shops" />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const heading = container.querySelector(".scoped-entity-heading h2");
    expect(heading?.textContent).toBe("app.nav.shops");
  });
});
