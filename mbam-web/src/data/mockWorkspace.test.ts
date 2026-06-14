import { describe, expect, it } from "vitest";
import {
  activateCloudWorkspace,
  isDemoWorkspace,
  workspace,
} from "./mockWorkspace";

describe("cloud workspace activation", () => {
  it("removes demo data before rendering an authenticated account", () => {
    activateCloudWorkspace({
      id: "user-1",
      fullName: "Real User",
      email: "real@example.com",
      provider: "google",
      verified: true,
    });

    expect(isDemoWorkspace()).toBe(false);
    expect(workspace.masterAccount.name).toBe("");
    expect(workspace.masterAccount.ownerName).toBe("Real User");
    expect(workspace.businesses).toEqual([]);
    expect(workspace.businessUnits).toEqual([]);
    expect(workspace.products).toEqual([]);
    expect(workspace.transactions).toEqual([]);
    expect(workspace.teamMembers).toEqual([
      expect.objectContaining({
        id: "user-1",
        fullName: "Real User",
        roleId: "role-master-owner",
      }),
    ]);
  });
});
