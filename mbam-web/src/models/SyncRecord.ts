import { v4 as uuidv4 } from "uuid";
import type {
  SyncRecord as ISyncRecord,
  SyncStatus,
  SyncEntityType,
  AppNotification,
  NotificationType,
} from "../types";

export class SyncRecord<T> implements ISyncRecord<T> {
  localId: string;
  serverId: string | null;
  entityType: SyncEntityType;
  payload: T;
  status: SyncStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  syncedAt: string | null;

  constructor(data: ISyncRecord<T>) {
    this.localId       = data.localId;
    this.serverId      = data.serverId ?? null;
    this.entityType    = data.entityType;
    this.payload       = data.payload;
    this.status        = data.status;
    this.retryCount    = data.retryCount;
    this.lastAttemptAt = data.lastAttemptAt ?? null;
    this.errorMessage  = data.errorMessage ?? null;
    this.createdAt     = data.createdAt;
    this.syncedAt      = data.syncedAt ?? null;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get isPending(): boolean  { return this.status === "pending"; }
  get isSyncing(): boolean  { return this.status === "syncing"; }
  get isSynced(): boolean   { return this.status === "synced"; }
  get isFailed(): boolean   { return this.status === "failed"; }
  get canRetry(): boolean   { return this.isFailed && this.retryCount < 5; }

  // ── State transitions ─────────────────────────────────────────────────────

  markSyncing(): SyncRecord<T> {
    return new SyncRecord({
      ...this.toJSON(),
      status:        "syncing",
      lastAttemptAt: new Date().toISOString(),
    });
  }

  markSynced(serverId: string): SyncRecord<T> {
    return new SyncRecord({
      ...this.toJSON(),
      status:    "synced",
      serverId,
      syncedAt:  new Date().toISOString(),
    });
  }

  markFailed(error: string): SyncRecord<T> {
    return new SyncRecord({
      ...this.toJSON(),
      status:        "failed",
      retryCount:    this.retryCount + 1,
      errorMessage:  error,
      lastAttemptAt: new Date().toISOString(),
    });
  }

  toJSON(): ISyncRecord<T> {
    return {
      localId:       this.localId,
      serverId:      this.serverId,
      entityType:    this.entityType,
      payload:       this.payload,
      status:        this.status,
      retryCount:    this.retryCount,
      lastAttemptAt: this.lastAttemptAt,
      errorMessage:  this.errorMessage,
      createdAt:     this.createdAt,
      syncedAt:      this.syncedAt,
    };
  }

  static create<T>(entityType: SyncEntityType, payload: T): SyncRecord<T> {
    return new SyncRecord<T>({
      localId:       uuidv4(),
      serverId:      null,
      entityType,
      payload,
      status:        "pending",
      retryCount:    0,
      lastAttemptAt: null,
      errorMessage:  null,
      createdAt:     new Date().toISOString(),
      syncedAt:      null,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class Notification implements AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;

  constructor(data: AppNotification) {
    this.id        = data.id;
    this.type      = data.type;
    this.title     = data.title;
    this.message   = data.message;
    this.read      = data.read;
    this.createdAt = data.createdAt;
  }

  get isUnread(): boolean { return !this.read; }

  markRead(): Notification {
    return new Notification({ ...this.toJSON(), read: true });
  }

  toJSON(): AppNotification {
    return {
      id:        this.id,
      type:      this.type,
      title:     this.title,
      message:   this.message,
      read:      this.read,
      createdAt: this.createdAt,
    };
  }

  static create(
    type: NotificationType,
    title: string,
    message: string
  ): Notification {
    return new Notification({
      id:        uuidv4(),
      type,
      title,
      message,
      read:      false,
      createdAt: new Date().toISOString(),
    });
  }
}
