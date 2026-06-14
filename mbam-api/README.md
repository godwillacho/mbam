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

## Local development with Docker PostgreSQL

Run these commands from the repository root:

```bash
cp docker-compose.private.env.example .env
docker compose -f docker-compose.private.yml up -d db
docker compose -f docker-compose.private.yml ps
```

Verify PostgreSQL before starting the API:

```bash
docker exec mbam-private-db pg_isready -U mbam -d mbam
docker exec mbam-private-db psql -U mbam -d mbam -c "select current_database(), current_user;"
```

Run the API directly on the host:

```bash
cd mbam-api
cp .env.example .env
cargo run
```

The host API must use `127.0.0.1:${POSTGRES_HOST_PORT}` because Docker publishes PostgreSQL to the Mac. The default host port is `5432`; set `POSTGRES_HOST_PORT=5433` in the root `.env` when another local PostgreSQL service already owns `5432`. An API running inside Compose must use `db:5432`; `db` is only resolvable on the Compose network.

The database name, user, and password in `mbam-api/.env` must match `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in the root `.env`.

PostgreSQL initialization variables apply only when the data volume is created. If `POSTGRES_PASSWORD` was changed after the first startup, either restore the old value or update the existing role without deleting data:

```bash
docker exec -it mbam-private-db psql -U mbam -d mbam \
  -c "alter user mbam with password 'your_current_root_env_password';"
```

For disposable test data only, the alternative is to recreate the volume:

```bash
docker compose -f docker-compose.private.yml down -v
docker compose -f docker-compose.private.yml up -d db
```

`down -v` permanently deletes the local database.

The API defaults to `127.0.0.1:8080`. If the full Compose stack is already running, its web container owns host port 8080; do not also start a host API on that port.

## Full Compose stack

To run PostgreSQL, the Rust API, and the web application together:

```bash
docker compose -f docker-compose.private.yml up --build
```

In this mode, open the application through `http://localhost:8080`. The API is reached through the Nginx `/api` proxy and connects to PostgreSQL using the internal hostname `db`.

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

## Product API and deployed base URL

Products use the same API base URL as authentication and synchronization:

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

Leave `VITE_API_BASE_URL` empty when the web application and API share a
domain. The included Nginx deployment proxies `/api/*` to the Rust service.
For separate domains, set `WEB_ORIGIN` on the API to the public web origin.

Product routes:

```text
GET    /api/v1/products
POST   /api/v1/products
POST   /api/v1/products/bulk
PATCH  /api/v1/products/:product_id
DELETE /api/v1/products/:product_id
```

Product reads and writes are permission and business-scope checked. Product
changes queued offline are encrypted, pushed through `/api/v1/sync/push`, and
included in scoped `/api/v1/sync/pull` snapshots. Each pull and push is tracked
in `sync_runs`.

## Microsoft sign-in

Create an app registration in Microsoft Entra ID that accepts personal
Microsoft accounts and organizational accounts. Add this web redirect URI:

`http://localhost:8080/api/v1/auth/oauth/microsoft/callback`

Create a client secret, grant delegated `User.Read` permission, and set:

```dotenv
MICROSOFT_OAUTH_CLIENT_ID=your_application_client_id
MICROSOFT_OAUTH_CLIENT_SECRET=your_client_secret
MICROSOFT_OAUTH_REDIRECT_URI=http://localhost:8080/api/v1/auth/oauth/microsoft/callback
```

## Password-reset email

Configure an SMTP account that supports STARTTLS on port 587:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your_smtp_username
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=Mbam
```

Password-reset tokens expire after 30 minutes, are stored only as SHA-256
hashes, are single-use, and revoke the user's existing refresh tokens when
consumed.

## Employees, invitations, and offline scope

Employee access is managed through direct API routes:

```text
GET    /api/v1/team-members
PATCH  /api/v1/team-members/:membership_id
DELETE /api/v1/team-members/:membership_id
POST   /api/v1/invites
POST   /api/v1/invites/details
POST   /api/v1/invites/accept
POST   /api/v1/invites/register
DELETE /api/v1/invites/:invitation_id
```

Role and scope changes are never queued offline. `GET /api/v1/sync/pull`
returns a server-filtered authorization snapshot and allowed entity keys.
Every push and pull attempt is recorded in `sync_runs`.
