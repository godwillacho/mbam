export type OfflineEntityType =
  | "transaction"
  | "product"
  | "customer"
  | "business"
  | "business_unit";

export type OfflineOperationAction = "create" | "update" | "delete";
export type OfflineOperationStatus =
  | "pending"
  | "syncing"
  | "conflict"
  | "failed";

export interface WrappedDataKey {
  version: 1;
  algorithm: "AES-GCM";
  derivation: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface EncryptedValue {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export interface OfflineGrantPayload {
  grantId: string;
  userId: string;
  displayName: string;
  email: string;
  deviceId: string;
  businessIds: string[];
  permissions: string[];
  authorizationVersion: number;
  issuedAt: string;
  offlineUntil: string;
}

export interface SignedOfflineGrant {
  token: string;
}

export interface VerifiedOfflineGrant extends SignedOfflineGrant {
  payload: OfflineGrantPayload;
}

export interface OfflineOperation<T = unknown> {
  operationId: string;
  deviceId: string;
  userId: string;
  businessId: string;
  businessUnitId?: string;
  entityType: OfflineEntityType;
  entityId: string;
  action: OfflineOperationAction;
  baseVersion: number | null;
  payload: T;
  createdAt: string;
}

export interface OfflineConflict<TLocal = unknown, TCloud = unknown> {
  conflictId: string;
  operationId: string;
  entityType: OfflineEntityType;
  entityId: string;
  localValue: TLocal;
  cloudValue: TCloud;
  detectedAt: string;
}

export interface SyncPushResult {
  operationId: string;
  outcome: "accepted" | "rejected" | "conflict";
  serverId?: string;
  serverVersion?: number;
  error?: string;
  cloudValue?: unknown;
}

export interface CloudChange<T = unknown> {
  changeId: string;
  entityType: OfflineEntityType;
  entityId: string;
  version: number;
  deleted: boolean;
  payload?: T;
  changedAt: string;
}

export interface SyncPullResult {
  cursor: string;
  changes: CloudChange[];
}
