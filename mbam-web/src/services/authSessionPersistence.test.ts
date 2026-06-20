import { beforeEach, describe, expect, it, vi } from "vitest";

const persistedRecords = vi.hoisted(() => new Map<string, unknown>());

vi.mock("idb", () => ({
  openDB: vi.fn(async () => ({
    get: async (_store: string, key: string) => persistedRecords.get(key),
    put: async (_store: string, value: { id: string }) => {
      persistedRecords.set(value.id, value);
    },
    delete: async (_store: string, key: string) => {
      persistedRecords.delete(key);
    },
  })),
}));

describe("authSessionPersistence", () => {
  beforeEach(() => {
    vi.resetModules();
    persistedRecords.clear();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {},
    });
  });

  it("saves and loads the persisted session", async () => {
    const persistence = await import("./authSessionPersistence");
    await persistence.savePersistedSession({
      user: {
        id: "user-1",
        fullName: "Persisted Session",
        email: "persisted.session@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "persisted-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    await expect(persistence.loadPersistedSession()).resolves.toMatchObject({
      accessToken: "persisted-token",
      user: { email: "persisted.session@mbam.local" },
    });
  });

  it("clears the persisted session", async () => {
    const persistence = await import("./authSessionPersistence");
    await persistence.savePersistedSession({
      user: {
        id: "user-2",
        fullName: "Cleared Session",
        email: "cleared.session@mbam.local",
        provider: "email",
        verified: true,
      },
      accessToken: "cleared-token",
      createdAt: "2026-06-20T00:00:00.000Z",
    });

    await persistence.clearPersistedSession();

    await expect(persistence.loadPersistedSession()).resolves.toBeNull();
  });
});
