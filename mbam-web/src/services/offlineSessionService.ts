import type {
  OfflineGrantPayload,
  SignedOfflineGrant,
  VerifiedOfflineGrant,
} from "../types/offline.types";
import { decodeBase64, decryptJson, encryptJson } from "./encryptionService";
import {
  deleteGrantRecord,
  getGrantRecord,
  saveGrantRecord,
} from "./offlineDatabase";
import {
  requireOfflineDataKey,
  requireOfflineVaultUserId,
} from "./offlineVaultService";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return decodeBase64(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
  );
}

function parseGrant(token: string): VerifiedOfflineGrant {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_offline_grant");

  const claims = JSON.parse(
    decoder.decode(decodeBase64Url(parts[1])),
  ) as OfflineGrantPayload & { exp?: number; iat?: number };

  return {
    token,
    payload: {
      grantId: claims.grantId,
      userId: claims.userId,
      displayName: claims.displayName,
      email: claims.email,
      deviceId: claims.deviceId,
      businessIds: claims.businessIds,
      permissions: claims.permissions,
      authorizationVersion: claims.authorizationVersion,
      issuedAt: claims.issuedAt,
      offlineUntil: claims.offlineUntil,
    },
  };
}

export async function importOfflineGrantPublicKey(
  spkiBase64: string,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    decodeBase64(spkiBase64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

async function verifyOfflineGrant(
  grant: SignedOfflineGrant,
  publicKey: CryptoKey,
): Promise<VerifiedOfflineGrant | null> {
  const parts = grant.token.split(".");
  if (parts.length !== 3) return null;

  const validSignature = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    decodeBase64Url(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) return null;

  const verified = parseGrant(grant.token);
  const offlineUntil = Date.parse(verified.payload.offlineUntil);
  const issuedAt = Date.parse(verified.payload.issuedAt);
  return Number.isFinite(offlineUntil) &&
    Number.isFinite(issuedAt) &&
    issuedAt <= Date.now() &&
    offlineUntil > Date.now()
    ? verified
    : null;
}

export async function saveOfflineGrant(
  grant: SignedOfflineGrant,
  publicKey: CryptoKey,
): Promise<void> {
  const verified = await verifyOfflineGrant(grant, publicKey);
  if (!verified) throw new Error("invalid_offline_grant");
  if (verified.payload.userId !== requireOfflineVaultUserId()) {
    throw new Error("offline_vault_user_mismatch");
  }

  const value = await encryptJson(
    requireOfflineDataKey(),
    verified,
    "grant:current",
  );
  await saveGrantRecord({
    id: "current",
    userId: verified.payload.userId,
    offlineUntil: verified.payload.offlineUntil,
    value,
  });
}

export async function getValidOfflineGrant(): Promise<VerifiedOfflineGrant | null> {
  const record = await getGrantRecord();
  if (!record) return null;
  if (record.userId !== requireOfflineVaultUserId()) {
    throw new Error("offline_vault_user_mismatch");
  }

  if (Date.parse(record.offlineUntil) <= Date.now()) {
    await deleteGrantRecord();
    return null;
  }

  return decryptJson<VerifiedOfflineGrant>(
    requireOfflineDataKey(),
    record.value,
    "grant:current",
  );
}
