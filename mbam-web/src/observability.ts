import * as Sentry from "@sentry/react";
import {
  initializeLogger,
  logger,
  sanitizeLogContext,
  sanitizeLogMessage,
} from "./services/logging/logger";

export function initializeObservability(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();

  if (dsn) {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined,
      sendDefaultPii: false,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: readSampleRate(
        import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
      ),
      beforeBreadcrumb(breadcrumb) {
        return {
          ...breadcrumb,
          message: breadcrumb.message
            ? sanitizeLogMessage(breadcrumb.message)
            : undefined,
          data: breadcrumb.data
            ? sanitizeLogContext(breadcrumb.data)
            : undefined,
        };
      },
      beforeSend(event) {
        event.user = undefined;
        if (event.request) {
          event.request.cookies = undefined;
          event.request.data = undefined;
          event.request.headers = undefined;
          event.request.url = safeUrl(event.request.url);
        }
        event.message = event.message
          ? sanitizeLogMessage(event.message)
          : undefined;
        event.extra = event.extra ? sanitizeLogContext(event.extra) : undefined;
        return event;
      },
      beforeSendTransaction(event) {
        if (event.request) {
          event.request.cookies = undefined;
          event.request.data = undefined;
          event.request.headers = undefined;
          event.request.url = safeUrl(event.request.url);
        }
        event.transaction = event.transaction?.split("?")[0];
        return event;
      },
    });
  }

  initializeLogger();
  logger.info("frontend observability initialized", {
    environment: import.meta.env.MODE,
    sentryEnabled: Boolean(dsn),
  });
}

function readSampleRate(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0];
  }
}
