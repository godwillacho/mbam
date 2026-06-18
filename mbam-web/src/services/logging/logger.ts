import * as Sentry from "@sentry/react";
import {
  bufferLog,
  deleteBufferedLog,
  readBufferedLogs,
  type BufferedLogRecord,
  type LogLevel,
} from "./loggingStore";

type LogContext = Record<string, unknown>;

const MAX_STRING_LENGTH = 500;
const MAX_SANITIZE_DEPTH = 4;
const SENSITIVE_KEY =
  /(authorization|cookie|password|passphrase|secret|token|private.?key|fingerprint|customer|contact|email|phone|address|full.?name|username|payload)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

let initialized = false;

function isSentryEnabled(): boolean {
  return Boolean(import.meta.env.VITE_SENTRY_DSN?.trim());
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth >= MAX_SANITIZE_DEPTH) return "[Truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeLogMessage(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogMessage(value.message),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY.test(key)
            ? "[Redacted]"
            : sanitizeValue(entry, depth + 1),
        ]),
    );
  }
  return sanitizeLogMessage(String(value));
}

export function sanitizeLogContext(context: LogContext = {}): LogContext {
  return sanitizeValue(context) as LogContext;
}

export function sanitizeLogMessage(value: string): string {
  return value
    .slice(0, MAX_STRING_LENGTH)
    .replace(EMAIL_VALUE, "[Redacted email]")
    .replace(BEARER_VALUE, "Bearer [Redacted]")
    .replace(JWT_VALUE, "[Redacted token]");
}

function writeToConsole(record: BufferedLogRecord): void {
  const method = record.level === "debug" ? "debug" : record.level;
  console[method](`[mbam] ${record.message}`, record.context);
}

function sendToSentry(record: BufferedLogRecord): void {
  Sentry.withScope((scope) => {
    scope.setLevel(record.level === "warn" ? "warning" : record.level);
    scope.setExtras(record.context);
    if (record.level === "debug" || record.level === "info") {
      Sentry.addBreadcrumb({
        category: "application",
        level: record.level,
        message: record.message,
        data: record.context,
      });
      return;
    }
    Sentry.captureMessage(record.message);
  });
}

async function persistForRetry(record: BufferedLogRecord): Promise<void> {
  try {
    await bufferLog(record);
  } catch (error) {
    console.error("[mbam] logging buffer unavailable", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

function emit(
  level: LogLevel,
  message: string,
  context: LogContext = {},
): void {
  const record: BufferedLogRecord = {
    level,
    message: sanitizeLogMessage(message),
    context: sanitizeLogContext(context),
    createdAt: new Date().toISOString(),
  };

  writeToConsole(record);
  if (!isSentryEnabled()) return;
  if (!isOnline()) {
    void persistForRetry(record);
    return;
  }

  try {
    sendToSentry(record);
  } catch {
    void persistForRetry(record);
  }
}

export async function flushBufferedLogs(): Promise<void> {
  if (!isSentryEnabled() || !isOnline()) return;

  let records: BufferedLogRecord[];
  try {
    records = await readBufferedLogs();
  } catch {
    return;
  }
  for (const record of records) {
    if (record.id === undefined) continue;
    try {
      sendToSentry(record);
      await deleteBufferedLog(record.id);
    } catch {
      return;
    }
  }
}

export function initializeLogger(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => {
    void flushBufferedLogs();
  });
  void flushBufferedLogs();
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    emit("debug", message, context);
  },
  info(message: string, context?: LogContext): void {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit("warn", message, context);
  },
  error(message: string, error?: unknown, context: LogContext = {}): void {
    emit("error", message, {
      ...context,
      error,
    });
  },
};
