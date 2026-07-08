# Source

This folder contains the Rust source code for the Mbam API.

## Files

- `main.rs` is the server entrypoint. It loads configuration, connects to PostgreSQL, runs migrations, builds shared state, mounts routes, and starts Axum.
- `config.rs` reads environment variables and converts them into typed runtime settings.
- `state.rs` defines shared application state, such as the PostgreSQL connection pool and configuration.
- `error.rs` defines API error types and converts them into JSON HTTP responses.
- `db/` contains database connection helpers.
- `routes/` is the router composition root: `app_router()` wires every domain
  module's routes together (CORS, tracing, `/api/v1/...` nesting).
- `auth/` contains everything about "who is calling" -- identity-provider
  authentication, password/token security helpers, and the legacy auth
  provider. See `auth/README.md`.
- `dev/` contains development-only fixtures and demo data, not compiled into
  production behavior beyond the `app_env == "development"` gate. See `dev/README.md`.
- `modules/` contains business domain modules.
