import { setSyncMeta } from "./localSyncStore";

export async function markRolePolicyChanged(nextVersion: string): Promise<void> {
  await setSyncMeta("rolePolicyVersion", nextVersion);
  await setSyncMeta("rolePolicyRefreshRequired", "true");
}
