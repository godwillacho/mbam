import { clearActiveSession, getAccessToken } from "./authSessionStore";
import { getDeviceBinding } from "./deviceBindingService";

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
  try {
    return await fetch(buildApiUrl(path), { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("request_timeout", 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    lockOutOnAuthFailure(response.status);
    throw new ApiClientError(isErrorResponse(body) ? body.error : "Request failed", response.status);
  }
  return body as TResponse;
}

export function isApiConfigured(): boolean {
  return true;
}

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function getJson<TResponse>(path: string): Promise<TResponse> {
  const accessToken = getAccessToken();
  const response = await apiFetch(path, {
    method: "GET",
    headers: { Accept: "application/json", ...(await deviceHeaders()), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: "include",
  });
  return parseJsonResponse<TResponse>(response);
}

export async function postJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("POST", path, payload);
}

export async function patchJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("PATCH", path, payload);
}

export async function deleteJson<TResponse>(path: string): Promise<TResponse> {
  const accessToken = getAccessToken();
  const response = await apiFetch(path, {
    method: "DELETE",
    headers: { Accept: "application/json", ...(await deviceHeaders()), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: "include",
  });
  return parseJsonResponse<TResponse>(response);
}

async function sendJson<TResponse, TPayload>(method: "POST" | "PATCH", path: string, payload: TPayload): Promise<TResponse> {
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
  return parseJsonResponse<TResponse>(response);
}
