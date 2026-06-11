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

export function isApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

export async function postJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  if (!isApiConfigured()) {
    throw new ApiClientError("API base URL is not configured", 0);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isErrorResponse(body) ? body.error : "Request failed";
    throw new ApiClientError(message, response.status);
  }

  return body as TResponse;
}
