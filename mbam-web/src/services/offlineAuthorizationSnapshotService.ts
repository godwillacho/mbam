import type { AuthSession } from "../types/auth";
import type { WorkspaceData } from "../types/workspace";
import { workspace } from "../data/mockWorkspace";
import type { DashboardProfile, TeamWorkspace } from "./teamService";
import { decryptJson, encryptJson } from "./encryptionService";
import {
  deleteAuthorizationSnapshotRecord,
  getAuthorizationSnapshotRecord,
  saveAuthorizationSnapshotRecord,
} from "./offlineDatabase";
import {
  isOfflineVaultUnlocked,
  requireOfflineDataKey,
  requireOfflineVaultUserId,
} from "./offlineVaultService";
import {
  assertCurrentDeviceBinding,
  getDeviceBinding,
  type DeviceBinding,
} from "./deviceBindingService";

const SNAPSHOT_ID = "current";
const SNAPSHOT_AAD = "authorization-snapshot:current";

export interface OfflineAuthorizationSnapshot {
  version: 1;
  userId: string;
  session: AuthSession;
  team: TeamWorkspace;
  workspaceData: WorkspaceData;
  dashboardProfile: DashboardProfile;
  selectedDashboardPath: string;
  deviceBinding: DeviceBinding;
  authorizationVersion: number;
  storedAt: string;
}

function cloneWorkspaceData(): WorkspaceData {
  return JSON.parse(JSON.stringify(workspace)) as WorkspaceData;
}

export async function saveOfflineAuthorizationSnapshot(
  session: AuthSession,
  team: TeamWorkspace,
  selectedDashboardPath: string,
): Promise<void> {
  if (!isOfflineVaultUnlocked()) return;
  if (session.user.id !== requireOfflineVaultUserId()) {
    throw new Error("offline_vault_user_mismatch");
  }

  const dashboardProfile = team.dashboard_profiles.find(
    (profile) => profile.user_id === session.user.id,
  ) ?? team.dashboard_profiles[0];
  if (!dashboardProfile) throw new Error("offline_dashboard_profile_missing");

  const deviceBinding = await getDeviceBinding();
  const snapshot: OfflineAuthorizationSnapshot = {
    version: 1,
    userId: session.user.id,
    session: {
      ...session,
      accessToken: "",
    },
    team,
    workspaceData: cloneWorkspaceData(),
    dashboardProfile,
    selectedDashboardPath,
    deviceBinding,
    authorizationVersion: team.authorization_version,
    storedAt: new Date().toISOString(),
  };
  const value = await encryptJson(requireOfflineDataKey(), snapshot, SNAPSHOT_AAD);
  await saveAuthorizationSnapshotRecord({
    id: SNAPSHOT_ID,
    userId: session.user.id,
    deviceId: deviceBinding.deviceId,
    authorizationVersion: team.authorization_version,
    storedAt: snapshot.storedAt,
    value,
  });
}

export async function getValidOfflineAuthorizationSnapshot(
  expectedUserId?: string,
): Promise<OfflineAuthorizationSnapshot | null> {
  if (!isOfflineVaultUnlocked()) return null;
  const record = await getAuthorizationSnapshotRecord();
  if (!record) return null;
  if (record.userId !== requireOfflineVaultUserId()) {
    throw new Error("offline_vault_user_mismatch");
  }
  if (expectedUserId && record.userId !== expectedUserId) {
    throw new Error("offline_snapshot_user_mismatch");
  }

  const snapshot = await decryptJson<OfflineAuthorizationSnapshot>(
    requireOfflineDataKey(),
    record.value,
    SNAPSHOT_AAD,
  );
  if (snapshot.version !== 1 || snapshot.userId !== record.userId) {
    await deleteAuthorizationSnapshotRecord();
    return null;
  }
  await assertCurrentDeviceBinding(snapshot.deviceBinding);
  return snapshot;
}

export async function clearOfflineAuthorizationSnapshot(): Promise<void> {
  await deleteAuthorizationSnapshotRecord();
}
