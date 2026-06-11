import { getJson, isApiConfigured, patchJson, postJson } from "../apiClient";
import {
  enqueueWrite,
  getCacheKey,
  getSyncMeta,
  isOnline,
  readCache,
  setSyncMeta,
  writeCache,
  type LocalSyncMethod,
  type LocalSyncModule,
  type LocalSyncSource,
} from "./localSyncStore";

export interface LocalSyncReadOptions<TFallback> {
  module: LocalSyncModule;
  path: string;
  fallback: () => TFallback | Promise<TFallback>;
  rolePolicyVersion?: string;
}

export interface LocalSyncReadResult<TData> {
  data: TData;
  source: LocalSyncSource;
  cachedAt?: string;
}

export interface LocalSyncWriteOptions<TPayload> {
  module: LocalSyncModule;
  method: Exclude<LocalSyncMethod, "GET">;
  path: string;
  payload: TPayload;
  rolePolicyVersion?: string;
}

export interface LocalSyncWriteResult<TData = unknown> {
  data?: TData;
  source: LocalSyncSource;
  queuedId?: string;
}

const DIRECT_API_PATH_PREFIXES = [
  "/api/v1/auth",
  "/api/v1/team-members",
  "/api/v1/roles",
  "/api/v1/permissions",
  "/api/v1/invites",
];

export function mustUseDirectApi(path: string): boolean {
  return DIRECT_API_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function localSyncRead<TData>(options: LocalSyncReadOptions<TData>): Promise<LocalSyncReadResult<TData>> {
  if (mustUseDirectApi(options.path)) {
    return { data: await getJson<TData>(options.path), source: "api" };
  }

  const cacheKey = getCacheKey(options.module, options.path);
  const cached = await readCache<TData>(cacheKey);

  if (!isApiConfigured() || !isOnline()) {
    if (cached) return { data: cached.data, source: "cache", cachedAt: cached.storedAt };
    return { data: await options.fallback(), source: "fallback" };
  }

  try {
    const data = await getJson<TData>(options.path);
    await writeCache({
      cacheKey,
      module: options.module,
      path: options.path,
      data,
      storedAt: new Date().toISOString(),
      rolePolicyVersion: options.rolePolicyVersion,
    });
    return { data, source: "api" };
  } catch {
    if (cached) return { data: cached.data, source: "cache", cachedAt: cached.storedAt };
    return { data: await options.fallback(), source: "fallback" };
  }
}

export async function localSyncWrite<TResponse, TPayload>(options: LocalSyncWriteOptions<TPayload>): Promise<LocalSyncWriteResult<TResponse>> {
  if (mustUseDirectApi(options.path)) {
    return { data: await sendWrite<TResponse, TPayload>(options.method, options.path, options.payload), source: "api" };
  }

  if (isApiConfigured() && isOnline()) {
    try {
      return { data: await sendWrite<TResponse, TPayload>(options.method, options.path, options.payload), source: "api" };
    } catch {
      // Queue below. A failed online write should not lose local user work.
    }
  }

  const queuedId = crypto.randomUUID();
  await enqueueWrite({
    id: queuedId,
    module: options.module,
    method: options.method,
    path: options.path,
    payload: options.payload,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    status: "queued",
    rolePolicyVersion: options.rolePolicyVersion,
  });

  return { source: "queued", queuedId };
}

async function sendWrite<TResponse, TPayload>(method: Exclude<LocalSyncMethod, "GET">, path: string, payload: TPayload): Promise<TResponse> {
  if (method === "POST") return postJson<TResponse, TPayload>(path, payload);
  if (method === "PATCH") return patchJson<TResponse, TPayload>(path, payload);
  throw new Error(`Local sync write method ${method} is not implemented yet.`);
}

export async function markRolePolicyChanged(nextVersion: string): Promise<void> {
  await setSyncMeta("rolePolicyVersion", nextVersion);
  await setSyncMeta("rolePolicyRefreshRequired", "true");
}

export async function shouldRefreshLocalDataForRoleChange(): Promise<boolean> {
  return isOnline() && (await getSyncMeta("rolePolicyRefreshRequired")) === "true";
}

export async function markRolePolicyRefreshComplete(): Promise<void> {
  await setSyncMeta("rolePolicyRefreshRequired", "false");
}
