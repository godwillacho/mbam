const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

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

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isErrorResponse(body) ? body.error : "Request failed";
    throw new ApiClientError(message, response.status);
  }

  return body as TResponse;
}

export function isApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

export async function getJson<TResponse>(path: string): Promise<TResponse> {
  if (!isApiConfigured()) {
    throw new ApiClientError("API base URL is not configured", 0);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse<TResponse>(response);
}

export async function postJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("POST", path, payload);
}

export async function patchJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  return sendJson<TResponse, TPayload>("PATCH", path, payload);
}

async function sendJson<TResponse, TPayload>(method: "POST" | "PATCH", path: string, payload: TPayload): Promise<TResponse> {
  if (!isApiConfigured()) {
    throw new ApiClientError("API base URL is not configured", 0);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<TResponse>(response);
}
