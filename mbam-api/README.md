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

## Google sign-in

Create an OAuth 2.0 Client ID for a **Web application** in Google Cloud Console.
For local development, configure:

- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `http://localhost:8080/api/v1/auth/oauth/google/callback`

Then set these values in `mbam-api/.env`:

```dotenv
WEB_ORIGIN=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/v1/auth/oauth/google/callback
```

The frontend must use the same hostname in `mbam-web/.env.development`:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
```

Do not mix `localhost` and `127.0.0.1` in this flow. Browser cookie rules
treat them as different sites, which prevents OAuth session completion.
