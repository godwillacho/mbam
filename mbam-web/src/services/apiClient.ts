import { getAccessToken } from "./authSessionStore";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

async function parseJsonResponse<TResponse>(
  response: Response,
): Promise<TResponse> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isErrorResponse(body) ? body.error : "Request failed";
    throw new ApiClientError(message, response.status);
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
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
  });

  return parseJsonResponse<TResponse>(response);
}

export async function postJson<TResponse, TPayload>(
  path: string,
  payload: TPayload,
): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("POST", path, payload);
}

export async function patchJson<TResponse, TPayload>(
  path: string,
  payload: TPayload,
): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("PATCH", path, payload);
}

export async function deleteJson<TResponse>(path: string): Promise<TResponse> {
  const accessToken = getAccessToken();
  const response = await fetch(buildApiUrl(path), {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
  });
  return parseJsonResponse<TResponse>(response);
}

async function sendJson<TResponse, TPayload>(
  method: "POST" | "PATCH",
  path: string,
  payload: TPayload,
): Promise<TResponse> {
  const accessToken = getAccessToken();
  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  return parseJsonResponse<TResponse>(response);
}
