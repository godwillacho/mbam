import type { AuthSession } from "../types/auth";
import type { WorkspaceData } from "../types/workspace";
import { workspace } from "../data/mockWorkspace";
import type { DashboardProfile, TeamWorkspace } from "../services/team/teamService";
import { decryptJson, encryptJson } from "../services/encryptionService";
import {
  deleteAuthorizationSnapshotRecord,
  getAuthorizationSnapshotRecord,
  saveAuthorizationSnapshotRecord,
} from "../services/offlineDatabase";
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
import { getValidOfflineGrant } from "./offlineSessionService";

const SNAPSHOT_ID = "current";
const SNAPSHOT_AAD = "authorization-snapshot:current";

export interface OfflineAuthorizationSnapshot {
  version: 2;
  userId: string;
  baselineRole: string;
  permissions: string[];
  businessIds: string[];
  businessUnitIds: string[];
  session: AuthSession;
  team: TeamWorkspace;
  workspaceData: WorkspaceData;
  dashboardProfile: DashboardProfile;
  selectedDashboardPath: string;
  deviceBinding: DeviceBinding;
  authorizationVersion: number;
  expiresAt: string;
  storedAt: string;
}

/** Returns true only for a current, unexpired snapshot matching its storage metadata. */
export function offlineSnapshotIsCurrent(
  snapshot: Pick<
    OfflineAuthorizationSnapshot,
    "version" | "userId" | "authorizationVersion" | "expiresAt"
  >,
  record: Pick<
    Awaited<ReturnType<typeof getAuthorizationSnapshotRecord>> & object,
    "userId" | "authorizationVersion"
  >,
  now = Date.now(),
): boolean {
  return (
    snapshot.version === 2 &&
    snapshot.userId === record.userId &&
    snapshot.authorizationVersion === record.authorizationVersion &&
    Date.parse(snapshot.expiresAt) > now
  );
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
  const grant = await getValidOfflineGrant();
  if (!grant || grant.payload.userId !== session.user.id) {
    throw new Error("offline_authorization_required");
  }
  if (grant.payload.authorizationVersion !== team.authorization_version) {
    throw new Error("offline_authorization_version_mismatch");
  }
  const member = team.members.find((candidate) => candidate.user_id === session.user.id);
  if (!member) throw new Error("offline_membership_missing");

  const deviceBinding = await getDeviceBinding();
  const snapshot: OfflineAuthorizationSnapshot = {
    version: 2,
    userId: session.user.id,
    baselineRole: member.role_code,
    permissions: dashboardProfile.permissions,
    businessIds: team.businesses.map((business) => business.id),
    businessUnitIds: team.business_units.map((unit) => unit.id),
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
    expiresAt: grant.payload.offlineUntil,
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
  if (!offlineSnapshotIsCurrent(snapshot, record)) {
    await deleteAuthorizationSnapshotRecord();
    return null;
  }
  await assertCurrentDeviceBinding(snapshot.deviceBinding);
  return snapshot;
}
