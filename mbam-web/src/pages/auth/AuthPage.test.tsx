// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./AuthPage";

const keycloakService = vi.hoisted(() => ({
  isKeycloakEnabled: vi.fn(() => true),
  loginWithKeycloak: vi.fn(),
  recoverKeycloakAccount: vi.fn(),
}));

vi.mock("../../auth/authService", () => ({
  enableOfflineAccess: vi.fn(),
  getCurrentSession: vi.fn(() => null),
  offlineAccessIsConfigured: vi.fn(async () => false),
  unlockOfflineSession: vi.fn(),
}));

vi.mock("../../auth/keycloakService", () => keycloakService);

vi.mock("../../services/offlineSyncService", () => ({
  createApiSyncTransport: vi.fn(),
  synchronizeOfflineChanges: vi.fn(),
}));

describe("AuthPage keycloak mode", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    keycloakService.isKeycloakEnabled.mockReturnValue(true);
    keycloakService.loginWithKeycloak.mockReset();
    keycloakService.recoverKeycloakAccount.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows only the secure Keycloak sign-in flow", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/auth"]}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Continue to secure sign in");
    expect(container.textContent).toContain("Recover or update your account");
    expect(container.textContent).not.toContain("Continue with Google");
    expect(container.textContent).not.toContain("Continue with Microsoft");
    expect(container.textContent).not.toContain("Continue with email");
  });
});
