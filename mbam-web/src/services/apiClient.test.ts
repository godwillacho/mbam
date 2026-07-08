import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentSession } from "../auth/authService";
import {
  API_AUTH_LOCK_EVENT,
  getJson,
} from "./apiClient";
import { clearActiveSession, setActiveSession } from "../auth/authSessionStore";

vi.mock("../auth/deviceBindingService", () => ({
  getDeviceBinding: vi.fn().mockRejectedValue(new Error("binding unavailable")),
}));

vi.mock("../auth/keycloakService", () => ({
  refreshKeycloakTokenIfNeeded: vi.fn().mockResolvedValue(undefined),
}));

describe("api auth failure handling", () => {
  beforeEach(() => {
    clearActiveSession();
    vi.restoreAllMocks();
  });

  it("keeps the active session on authorization denial", async () => {
    setActiveSession({
      user: {
        id: "user-cashier",
        fullName: "Cashier Test",
        email: "cashier.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "cashier-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });
    const lockSpy = vi.fn();
    window.addEventListener(API_AUTH_LOCK_EVENT, lockSpy);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "forbidden" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      },
    )));

    await expect(getJson("/api/v1/reports/shops")).rejects.toMatchObject({
      status: 403,
    });

    expect(getCurrentSession()?.accessToken).toBe("cashier-token");
    expect(lockSpy).not.toHaveBeenCalled();
    window.removeEventListener(API_AUTH_LOCK_EVENT, lockSpy);
  });

  it("clears the active session on authentication failure", async () => {
    setActiveSession({
      user: {
        id: "user-cashier",
        fullName: "Cashier Test",
        email: "cashier.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "cashier-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });
    const lockSpy = vi.fn();
    window.addEventListener(API_AUTH_LOCK_EVENT, lockSpy);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    )));

    await expect(getJson("/api/v1/reports/shops")).rejects.toMatchObject({
      status: 401,
    });

    expect(getCurrentSession()).toBeNull();
    expect(lockSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener(API_AUTH_LOCK_EVENT, lockSpy);
  });

  it("ignores a 401 from a stale concurrent token when a newer session token exists", async () => {
    setActiveSession({
      user: {
        id: "user-cashier",
        fullName: "Cashier Test",
        email: "cashier.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "stale-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        setActiveSession({
          user: {
            id: "user-cashier",
            fullName: "Cashier Test",
            email: "cashier.test@mbam.local",
            provider: "email",
            verified: true,
          },
          accessToken: "fresh-token",
          createdAt: "2026-06-20T00:00:00.000Z",
        });
      }

      return Promise.resolve(new Response(
        JSON.stringify({ error: "unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ));
    }));

    await expect(getJson("/api/v1/reports/shops")).rejects.toMatchObject({
      status: 401,
    });

    expect(getCurrentSession()?.accessToken).toBe("fresh-token");
  });
});
