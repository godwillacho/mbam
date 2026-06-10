# Source

This folder contains the Rust source code for the Mbam API.

## Files

- `main.rs` is the server entrypoint. It loads configuration, connects to PostgreSQL, runs migrations, builds shared state, mounts routes, and starts Axum.
- `config.rs` reads environment variables and converts them into typed runtime settings.
- `state.rs` defines shared application state, such as the PostgreSQL connection pool and configuration.
- `error.rs` defines API error types and converts them into JSON HTTP responses.
- `db/` contains database connection helpers.
- `routes/` contains top-level routes that are not owned by a domain module.
- `security/` contains password and token security helpers.
- `modules/` contains business domain modules.
