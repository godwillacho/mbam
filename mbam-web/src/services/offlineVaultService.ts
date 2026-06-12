import { createWrappedDataKey, unwrapDataKey } from "./encryptionService";
import { getVaultRecord, saveVaultRecord } from "./offlineDatabase";

let activeDataKey: CryptoKey | null = null;
let activeUserId: string | null = null;

export async function setupOfflineVault(
  userId: string,
  passphrase: string,
): Promise<void> {
  if (await getVaultRecord()) {
    throw new Error("offline_vault_already_exists");
  }

  const { key, wrappedKey } = await createWrappedDataKey(passphrase);
  await saveVaultRecord(userId, wrappedKey);
  activeDataKey = key;
  activeUserId = userId;
}

export async function hasOfflineVault(userId?: string): Promise<boolean> {
  const vault = await getVaultRecord();
  return Boolean(vault && (!userId || vault.userId === userId));
}

export async function unlockOfflineVault(
  passphrase: string,
  expectedUserId?: string,
): Promise<void> {
  const vault = await getVaultRecord();
  if (!vault) {
    throw new Error("offline_vault_not_configured");
  }
  if (expectedUserId && vault.userId !== expectedUserId) {
    throw new Error("offline_vault_user_mismatch");
  }

  try {
    activeDataKey = await unwrapDataKey(passphrase, vault.wrappedKey);
    activeUserId = vault.userId;
  } catch {
    activeDataKey = null;
    activeUserId = null;
    throw new Error("offline_vault_unlock_failed");
  }
}

export function lockOfflineVault(): void {
  activeDataKey = null;
  activeUserId = null;
}

export function isOfflineVaultUnlocked(): boolean {
  return activeDataKey !== null;
}

export function requireOfflineDataKey(): CryptoKey {
  if (!activeDataKey) {
    throw new Error("offline_vault_locked");
  }
  return activeDataKey;
}

export function requireOfflineVaultUserId(): string {
  if (!activeUserId) {
    throw new Error("offline_vault_locked");
  }
  return activeUserId;
}
