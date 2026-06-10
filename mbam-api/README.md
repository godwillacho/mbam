# Mbam API

This folder contains the Rust backend for Mbam.

The API is the security boundary between the React frontend and PostgreSQL. The frontend must never connect directly to the database. Authentication, role checks, business account permissions, CRUD operations, and offline sync operations pass through this service.

## File map

- `Cargo.toml` defines the Rust package and backend dependencies.
- `.env.example` documents required local environment variables.
- `migrations/` contains SQL files for PostgreSQL schema creation and updates.
- `src/main.rs` starts the API server, loads configuration, connects to PostgreSQL, runs migrations, and mounts routes.
- `src/config.rs` reads runtime configuration from environment variables.
- `src/state.rs` defines shared application state passed into route handlers.
- `src/error.rs` centralizes API error responses.
- `src/db/` contains database connection helpers.
- `src/routes/` contains top-level API routes.
- `src/security/` contains password hashing and token helpers.
- `src/modules/` contains domain modules for auth, users, accounts, businesses, units, roles, permissions, memberships, and sync.

## Local development

```bash
cd mbam-api
cp .env.example .env
cargo run
```

The API defaults to `127.0.0.1:8080`.
