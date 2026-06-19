import { clearActiveSession, getAccessToken } from "./authSessionStore";
import { getDeviceBinding } from "./deviceBindingService";
import { refreshKeycloakTokenIfNeeded } from "./keycloakService";
import { logger } from "./logging/logger";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000);

export const API_AUTH_LOCK_EVENT = "mbam-api-auth-lock";

export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiClientError";
  }
}

function isErrorResponse(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value && typeof (value as { error?: unknown }).error === "string";
}

function lockOutOnAuthFailure(status: number): void {
  if (status !== 401 && status !== 403) return;
  clearActiveSession();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(API_AUTH_LOCK_EVENT));
}

async function deviceHeaders(): Promise<Record<string, string>> {
  const binding = await getDeviceBinding().catch(() => null);
  return binding ? {
    "X-Mbam-Device-Id": binding.deviceId,
    "X-Mbam-Device-Fingerprint": binding.fingerprintHash,
    "X-Mbam-Device-Label": binding.deviceLabel,
  } : {};
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = init.method ?? "GET";
  try {
    return await fetch(buildApiUrl(path), { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      logger.warn("api request timed out", {
        method,
        path: safeApiPath(path),
      });
      throw new ApiClientError("request_timeout", 408);
    }
    logger.error("api request failed before receiving a response", error, {
      method,
      path: safeApiPath(path),
    });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function parseJsonResponse<TResponse>(
  response: Response,
  method: string,
  path: string,
): Promise<TResponse> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    lockOutOnAuthFailure(response.status);
    logger.warn("api returned an unsuccessful response", {
      method,
      path: safeApiPath(path),
      status: response.status,
    });
    throw new ApiClientError(isErrorResponse(body) ? body.error : "Request failed", response.status);
  }
  return body as TResponse;
}

function safeApiPath(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    return url.pathname.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ":id",
    );
  } catch {
    return value.split("?")[0].slice(0, 200);
  }
}

export function isApiConfigured(): boolean {
  return true;
}

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function getJson<TResponse>(path: string): Promise<TResponse> {
  await refreshKeycloakTokenIfNeeded();
  const accessToken = getAccessToken();
  const response = await apiFetch(path, {
    method: "GET",
    headers: { Accept: "application/json", ...(await deviceHeaders()), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: "include",
  });
  return parseJsonResponse<TResponse>(response, "GET", path);
}

export async function postJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("POST", path, payload);
}

export async function patchJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("PATCH", path, payload);
}

export async function deleteJson<TResponse>(path: string): Promise<TResponse> {
  await refreshKeycloakTokenIfNeeded();
  const accessToken = getAccessToken();
  const response = await apiFetch(path, {
    method: "DELETE",
    headers: { Accept: "application/json", ...(await deviceHeaders()), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: "include",
  });
  return parseJsonResponse<TResponse>(response, "DELETE", path);
}

async function sendJson<TResponse, TPayload>(method: "POST" | "PATCH", path: string, payload: TPayload): Promise<TResponse> {
  await refreshKeycloakTokenIfNeeded();
  const accessToken = getAccessToken();
  const response = await apiFetch(path, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(await deviceHeaders()),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  return parseJsonResponse<TResponse>(response, method, path);
}
