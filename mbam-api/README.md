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
- `src/observability.rs` configures console, rolling-file, and Sentry logging.
- `src/db/` contains database connection helpers.
- `src/routes/` contains top-level API routes.
- `src/security/` contains password hashing and token helpers.
- `src/modules/` contains the active auth, authorization-bootstrap, business,
  unit, product, team, transaction, and sync domains.

## Local development with Docker PostgreSQL and Keycloak

Run these commands from the repository root:

```bash
cp docker-compose.private.env.example .env
docker compose -f docker-compose.private.yml up -d
docker compose -f docker-compose.private.yml ps
```

This starts PostgreSQL and Keycloak together. Running the historical targeted
command `docker compose -f docker-compose.private.yml up -d db` also starts
Keycloak because the database service declares it as a startup dependency.

Verify both services before starting the API:

```bash
docker exec mbam-private-db pg_isready -U mbam -d mbam
docker exec mbam-private-db psql -U mbam -d mbam -c "select current_database(), current_user;"
curl --fail http://127.0.0.1:8180/realms/mbam/.well-known/openid-configuration
```

Run the API directly on the host:

```bash
cd mbam-api
cp .env.example .env
cargo run
```

The host API must use `127.0.0.1:${POSTGRES_HOST_PORT}` because Docker publishes PostgreSQL to the Mac. The default host port is `5432`; set `POSTGRES_HOST_PORT=5433` in the root `.env` when another local PostgreSQL service already owns `5432`. An API running inside Compose must use `db:5432`; `db` is only resolvable on the Compose network.

The database name, user, and password in `mbam-api/.env` must match
`POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in the root `.env`.
For local Keycloak mode, copy the Keycloak values from
`mbam-api/.env.example`; the imported realm uses the matching development-only
`mbam-api` client secret.

PostgreSQL initialization variables apply only when the data volume is created. If `POSTGRES_PASSWORD` was changed after the first startup, either restore the old value or update the existing role without deleting data:

```bash
docker exec -it mbam-private-db psql -U mbam -d mbam \
  -c "alter user mbam with password 'your_current_root_env_password';"
```

For disposable test data only, the alternative is to recreate the volume:

```bash
docker compose -f docker-compose.private.yml down -v
docker compose -f docker-compose.private.yml up -d
```

`down -v` permanently deletes the local database.

The API defaults to `127.0.0.1:8080`.

Logging and optional Sentry configuration are documented in
[`../docs/observability.md`](../docs/observability.md).

## Keycloak authentication

Protected API routes now use the centralized authentication layer. Set
`AUTH_PROVIDER=keycloak` to validate access tokens through the imported `mbam`
realm. The browser runtime now relies on Keycloak-managed sign-in, recovery,
logout, and identity brokering.

The local realm is imported from `keycloak/mbam-realm.json` and includes:

- the confidential `mbam-api` introspection client;
- the public `mbam-web` Authorization Code client;
- the `master_owner`, `business_admin`, `shop_manager`, and `cashier` roles;
- an audience mapper that places `mbam-api` in web access tokens.

Keycloak identity and role claims never replace Mbam's PostgreSQL scope checks.
Each accepted Keycloak subject must map to an active local user with active
memberships that resolve to exactly one matching baseline role. Permissions and
resource scope are checked on the same membership grant. See
[`src/authentication/README.md`](src/authentication/README.md) for provisioning
and migration details.

The frontend's sole online authorization bootstrap is:

```text
GET /api/v1/me/authorization
```

It returns only the current user's validated identity, role, permissions,
business/shop scope, dashboard, authorized routes, and authorization version.
It never returns the employee directory, invitations, or role definitions.

## Full Compose stack

The private Compose file manages PostgreSQL and Keycloak. Run the API and web
server directly on the host.
Identity-provider brokering such as Google and Microsoft sign-in now belongs in
Keycloak. Configure redirect URIs, client secrets, and account-recovery actions
on the Keycloak clients instead of on Mbam-hosted browser routes.

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

## Operational email

Configure an SMTP account that supports STARTTLS on port 587 for invitations
and operational email:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your_smtp_username
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=Mbam
```

## Employees, invitations, and offline scope

Employee access is managed through direct API routes:

```text
GET    /api/v1/team-members
PATCH  /api/v1/team-members/:membership_id
DELETE /api/v1/team-members/:membership_id
POST   /api/v1/invites
POST   /api/v1/invites/details
POST   /api/v1/invites/accept
DELETE /api/v1/invites/:invitation_id
```

Role and scope changes are never queued offline. `GET /api/v1/sync/pull`
returns a server-filtered authorization snapshot and allowed entity keys.
Every push and pull attempt is recorded in `sync_runs`.

The employee endpoint applies maximum role ceilings independently of frontend
controls. Shop managers see and manage only cashiers in assigned shops; cashiers
receive `403` for employee-management requests.
