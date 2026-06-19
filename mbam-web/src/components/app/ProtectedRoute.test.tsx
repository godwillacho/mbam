// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateCloudWorkspace } from "../../data/mockWorkspace";
import { setCurrentMemberId } from "../../security/accessControl";
import ProtectedRoute from "./ProtectedRoute";

function renderRoute(root: Root, path: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/businesses"
            element={
              <ProtectedRoute routeKey="businesses">
                <div>business page</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute routeKey="team">
                <div>employees page</div>
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

describe("ProtectedRoute matrix", () => {
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

  it("redirects a cashier away from the Employees route", () => {
    updateCloudWorkspace({
      teamMembers: [
        {
          id: "member-cashier",
          fullName: "Scoped Cashier",
          email: "cashier@example.com",
          roleId: "role-cashier",
          permissions: ["screen.products", "screen.reports"],
          scopeLevel: "unit",
          businessId: "business-1",
          businessUnitId: "unit-1",
          status: "active",
        },
      ],
    });
    setCurrentMemberId("member-cashier");

    renderRoute(root, "/employees");

    expect(container.textContent).toContain("dashboard page");
    expect(container.textContent).not.toContain("employees page");
  });

  it("allows an explicitly authorized business admin onto the Businesses route", () => {
    updateCloudWorkspace({
      teamMembers: [
        {
          id: "member-admin",
          fullName: "Scoped Admin",
          email: "admin@example.com",
          roleId: "role-business-admin",
          permissions: ["screen.businesses", "screen.team", "screen.reports"],
          scopeLevel: "business",
          businessId: "business-1",
          status: "active",
        },
      ],
    });
    setCurrentMemberId("member-admin");

    renderRoute(root, "/businesses");

    expect(container.textContent).toContain("business page");
    expect(container.textContent).not.toContain("dashboard page");
  });
});
