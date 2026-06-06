// ─────────────────────────────────────────────────────────────────────────────
// api.types.ts
// Shared API envelope, error shapes, and offline sync record types.
// Every API response from mbam-api is wrapped in ApiResponse<T>.
// ─────────────────────────────────────────────────────────────────────────────

// ── Standard API response envelope ───────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: string[];
}

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ── Offline sync record ───────────────────────────────────────────────────────
// Every entity created offline gets a SyncRecord wrapping it in IndexedDB.
// The sync worker reads pending records and pushes them to the API when online.
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export type SyncEntityType = "transaction" | "product";

export interface SyncRecord<T> {
  localId: string;           // uuid v4, created offline
  serverId: string | null;   // set after successful sync
  entityType: SyncEntityType;
  payload: T;
  status: SyncStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  syncedAt: string | null;
}

// ── App-level notification (not push — in-app only) ───────────────────────────
export type NotificationType = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
