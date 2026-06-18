# MBAM Observability

MBAM uses native logging for each runtime:

- The Rust API uses `tracing`, `tracing-subscriber`, and `tracing-appender`.
- The React PWA uses the shared frontend logger, browser console output,
  IndexedDB buffering, and `@sentry/react`.
- Both runtimes can send production errors to Sentry when a DSN is configured.

## Rust API

The API writes:

- Human-readable console logs in development.
- JSON console logs in production.
- Daily rolling JSON files under `mbam-api/logs/`.
- `debug.log.YYYY-MM-DD` for events up to debug verbosity.
- `error.log.YYYY-MM-DD` for errors only.

Configuration:

```dotenv
RUST_LOG=mbam_api=debug,tower_http=info
LOG_DIRECTORY=logs
LOG_JSON=false
SENTRY_DSN=
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0
```

`SENTRY_DSN` is optional. Error events are sent to Sentry, warning and
information events become breadcrumbs, and debug/trace events remain local.

Use structured fields with static messages:

```rust
tracing::info!(transaction.id = %transaction_id, "transaction recorded");
tracing::error!(error.kind = "database", "transaction persistence failed");
```

Do not attach request bodies, authorization headers, cookies, credentials,
customer details, device fingerprints, or raw database errors.

## React PWA

Initialize observability before rendering React. The shared logger provides:

```ts
logger.debug("offline sync scheduled", { operationId });
logger.info("workspace loaded", { source: "api" });
logger.warn("api returned an unsuccessful response", { status: 403 });
logger.error("offline sync failed", error, { operationId });
```

The logger:

1. Sanitizes messages and context.
2. Writes sanitized records to the browser console.
3. Sends debug/info records to Sentry as breadcrumbs.
4. Sends warnings/errors to Sentry as captured messages.
5. Buffers up to 200 records in `mbam-logging` IndexedDB while offline.
6. Flushes buffered records when the browser reconnects.

Configuration:

```dotenv
VITE_SENTRY_DSN=
VITE_SENTRY_RELEASE=
VITE_SENTRY_TRACES_SAMPLE_RATE=0
```

Leave the DSN empty to disable remote reporting. Sentry DSNs are public client
configuration, but source-map upload tokens must never use a `VITE_` variable
or ship in the browser bundle.

## Data Safety

Logging must use static event messages and identifiers that are safe for
diagnostics. Never log:

- Passwords or passphrases
- Access or refresh tokens
- Cookies or authorization headers
- OAuth codes
- Private keys or secrets
- Device fingerprints
- Customer names, contact details, addresses, or transaction payloads

The frontend sanitizer is defense in depth, not permission to pass sensitive
objects into the logger.
