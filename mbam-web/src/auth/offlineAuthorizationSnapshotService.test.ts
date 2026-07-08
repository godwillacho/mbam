import { describe, expect, it } from "vitest";
import { offlineSnapshotIsCurrent } from "./offlineAuthorizationSnapshotService";

describe("offline authorization snapshot expiry", () => {
  const record = {
    userId: "user-one",
    authorizationVersion: 7,
  };

  it("accepts only the current version before its explicit expiry", () => {
    expect(
      offlineSnapshotIsCurrent(
        {
          version: 2,
          userId: "user-one",
          authorizationVersion: 7,
          expiresAt: "2026-06-20T00:00:00.000Z",
        },
        record,
        Date.parse("2026-06-19T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("fails closed for expired, stale, or legacy snapshots", () => {
    const now = Date.parse("2026-06-20T00:00:00.000Z");
    expect(
      offlineSnapshotIsCurrent(
        {
          version: 2,
          userId: "user-one",
          authorizationVersion: 7,
          expiresAt: "2026-06-20T00:00:00.000Z",
        },
        record,
        now,
      ),
    ).toBe(false);
    expect(
      offlineSnapshotIsCurrent(
        {
          version: 2,
          userId: "user-one",
          authorizationVersion: 6,
          expiresAt: "2026-06-21T00:00:00.000Z",
        },
        record,
        now,
      ),
    ).toBe(false);
    expect(
      offlineSnapshotIsCurrent(
        {
          version: 1 as never,
          userId: "user-one",
          authorizationVersion: 7,
          expiresAt: "2026-06-21T00:00:00.000Z",
        },
        record,
        now,
      ),
    ).toBe(false);
  });
});
