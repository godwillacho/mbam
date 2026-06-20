import { beforeEach, describe, expect, it, vi } from "vitest";

const keycloakMock = vi.hoisted(() => ({
  instance: {
    authenticated: true,
    token: "fresh-access-token",
    refreshToken: undefined as string | undefined,
    updateToken: vi.fn().mockResolvedValue(true),
    login: vi.fn(),
    logout: vi.fn(),
    init: vi.fn(),
    clearToken: vi.fn(),
  },
}));

vi.mock("keycloak-js", () => ({
  default: class MockKeycloak {
    constructor() {
      return keycloakMock.instance;
    }
  },
}));

describe("refreshKeycloakTokenIfNeeded", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_AUTH_PROVIDER", "keycloak");
    keycloakMock.instance.authenticated = true;
    keycloakMock.instance.token = "fresh-access-token";
    keycloakMock.instance.refreshToken = undefined;
    keycloakMock.instance.updateToken.mockClear();
  });

  it("preserves the stored session token when no refresh token is available", async () => {
    const authStore = await import("./authSessionStore");
    authStore.clearActiveSession();
    authStore.setActiveSession({
      user: {
        id: "user-cashier",
        fullName: "Cashier Test",
        email: "cashier.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "stale-access-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    const service = await import("./keycloakService");
    await service.refreshKeycloakTokenIfNeeded();

    expect(keycloakMock.instance.updateToken).not.toHaveBeenCalled();
    expect(authStore.getAccessToken()).toBe("stale-access-token");
  });

  it("preserves the stored session token when refresh fails", async () => {
    keycloakMock.instance.refreshToken = "refresh-token";
    keycloakMock.instance.updateToken.mockRejectedValueOnce(
      new Error("refresh failed"),
    );

    const authStore = await import("./authSessionStore");
    authStore.clearActiveSession();
    authStore.setActiveSession({
      user: {
        id: "user-cashier",
        fullName: "Cashier Test",
        email: "cashier.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "stale-access-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    const service = await import("./keycloakService");
    await service.refreshKeycloakTokenIfNeeded();

    expect(keycloakMock.instance.updateToken).toHaveBeenCalledTimes(1);
    expect(authStore.getAccessToken()).toBe("stale-access-token");
  });
});

describe("initializeKeycloak", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_AUTH_PROVIDER", "keycloak");
    keycloakMock.instance.authenticated = true;
    keycloakMock.instance.token = "fresh-access-token";
    keycloakMock.instance.refreshToken = undefined;
    keycloakMock.instance.updateToken.mockClear();
    keycloakMock.instance.init.mockReset();
    keycloakMock.instance.clearToken.mockReset();
  });

  it("preserves a stored session when check-sso reports unauthenticated", async () => {
    keycloakMock.instance.init.mockResolvedValue(false);

    const authStore = await import("./authSessionStore");
    authStore.clearActiveSession();
    authStore.setActiveSession({
      user: {
        id: "user-master",
        fullName: "Master Reload",
        email: "master.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "stored-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    const service = await import("./keycloakService");
    await service.initializeKeycloak();

    expect(authStore.getAccessToken()).toBe("stored-token");
  });
});
