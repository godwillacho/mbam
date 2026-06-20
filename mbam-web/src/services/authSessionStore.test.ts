import { beforeEach, describe, expect, it, vi } from "vitest";

const persistenceState = vi.hoisted(() => {
  let session: unknown = null;
  return {
    clearPersistedSession: vi.fn(async () => {
      session = null;
    }),
    loadPersistedSession: vi.fn(async () => session),
    savePersistedSession: vi.fn(async (value: unknown) => {
      session = value;
    }),
    reset() {
      session = null;
      this.clearPersistedSession.mockClear();
      this.loadPersistedSession.mockClear();
      this.savePersistedSession.mockClear();
    },
    set(value: unknown) {
      session = value;
    },
  };
});

vi.mock("./authSessionPersistence", () => persistenceState);

describe("authSessionStore", () => {
  beforeEach(async () => {
    vi.resetModules();
    persistenceState.reset();
    const entries = new Map<string, string>();
    const fakeStorage: Storage = {
      get length() {
        return entries.size;
      },
      clear() {
        entries.clear();
      },
      getItem(key: string) {
        return entries.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(entries.keys())[index] ?? null;
      },
      removeItem(key: string) {
        entries.delete(key);
      },
      setItem(key: string, value: string) {
        entries.set(key, value);
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: fakeStorage,
    });
  });

  it("persists the active session in local storage", async () => {
    const store = await import("./authSessionStore");
    store.setActiveSession({
      user: {
        id: "user-1",
        fullName: "Reload Test",
        email: "reload.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "reload-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    expect(store.getAccessToken()).toBe("reload-token");
    expect(window.localStorage.getItem("mbam-active-session")).toContain(
      "reload-token",
    );
    expect(persistenceState.savePersistedSession).toHaveBeenCalledTimes(1);
  });

  it("rehydrates the active session from local storage", async () => {
    window.localStorage.setItem(
      "mbam-active-session",
      JSON.stringify({
        user: {
          id: "user-2",
          fullName: "Reload Restore",
          email: "restore.test@mbam.local",
          provider: "email",
          verified: true,
        },
        accessToken: "restored-token",
        createdAt: "2026-06-20T00:00:00.000Z",
      }),
    );

    const store = await import("./authSessionStore");
    expect(store.getAccessToken()).toBe("restored-token");
    expect(store.getActiveSession()?.user.email).toBe("restore.test@mbam.local");
  });

  it("clears both memory and local storage on logout", async () => {
    const store = await import("./authSessionStore");
    store.setActiveSession({
      user: {
        id: "user-3",
        fullName: "Logout Test",
        email: "logout.test@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "logout-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    store.clearActiveSession();

    expect(store.getActiveSession()).toBeNull();
    expect(window.localStorage.getItem("mbam-active-session")).toBeNull();
    expect(persistenceState.clearPersistedSession).toHaveBeenCalledTimes(1);
  });

  it("hydrates the active session from persisted storage when local storage is unavailable", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage unavailable");
      },
    });
    persistenceState.set({
      user: {
        id: "user-4",
        fullName: "Persisted Reload",
        email: "persisted.reload@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "persisted-reload-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    const store = await import("./authSessionStore");
    await store.hydrateActiveSession();

    expect(store.getAccessToken()).toBe("persisted-reload-token");
    expect(store.getActiveSession()?.user.email).toBe(
      "persisted.reload@mbam.local",
    );
  });
});
