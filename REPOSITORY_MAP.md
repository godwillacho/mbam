# MBAM Repository Map

This is the navigation map for the running MBAM codebase. It describes active
modules only. Database migrations and future-planning documents remain
historical/product references, not runtime modules.

## Runtime overview

```text
React PWA
  App.tsx (mounts BrowserRouter only)
    -> routing/AppRoutes.tsx (the route table)
      -> routing/ProtectedRoute.tsx + routing/accessControl.ts
      -> pages
        -> services (see auth/ facade for the auth-related ones)
          -> HTTP API
          -> encrypted IndexedDB/offline sync

Rust API
  main.rs
    -> configuration + observability + PostgreSQL
    -> routes::app_router() (the router composition root)
      -> domain routes (see auth/ facade for the auth-related modules)
        -> services
          -> repositories
            -> PostgreSQL
```

## Root

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Mandatory repository workflow and logging rules |
| `REPOSITORY_MAP.md` | This living navigation map |
| `docker-compose.private.yml` | Local PostgreSQL and Keycloak (API and web run on the host — see `docs/private-testing.md`) |
| `docker-compose.private.env.example` | Template for the private-stack env vars (copy, do not commit the real file) |
| `keycloak/mbam-realm.json` | Reproducible local realm, clients, audience, and baseline roles |
| `docs/` | Security, observability, testing, deployment, and future-product documents |
| `debug.log`, `error.log` | Required engineering change records |
| `.github/workflows/` | API, security, and integration automation (runs on push to `main` and on pull requests) |

Generated local directories such as `mbam-api/target`, `mbam-web/node_modules`,
and `mbam-web/dist` are not source modules and can be recreated.

## Deployment

| Path | Purpose |
| --- | --- |
| `mbam-api/Dockerfile` | Multi-stage build: compiles `mbam-api` in release mode (`--locked`, using `Cargo.lock`), runs the binary in a slim Debian image |
| `mbam-api/.dockerignore` | Keeps `.env`, `target/`, `logs/`, and docs out of the build context/image |
| `mbam-web/Dockerfile` | Multi-stage build: `npm run build` then serves `dist/` via `mbam-web/nginx.conf` |
| `mbam-web/.dockerignore` | Keeps `.env*`, `node_modules`, `dist`, and docs out of the build context/image |
| `mbam-web/nginx.conf` | SPA fallback routing plus a `/api/` reverse proxy to a service named `api` |

No compose file currently wires the API/web container images together with
`db`/`keycloak` for a full containerized stack — see `docs/private-testing.md`
for what actually runs today (API and web on the host, Postgres/Keycloak in
Docker) versus what the Dockerfiles are staged for.

## Rust API: `mbam-api`

### Entrypoints and infrastructure

| Path | Responsibility |
| --- | --- |
| `src/main.rs` | Process entrypoint, migrations, development seed, router |
| `src/config.rs` | Typed environment loading and production validation |
| `src/state.rs` | Shared Axum state |
| `src/error.rs` | Safe public API errors and server-error logging |
| `src/observability.rs` | Console, rolling files, and optional Sentry |
| `src/db/pool.rs` | PostgreSQL connection pool |
| `src/security/password.rs` | Argon2 password hashing and verification |
| `src/security/tokens.rs` | Access tokens, opaque refresh tokens, offline grants |
| `src/routes/mod.rs` | Composition root: builds `app_router()` (CORS, tracing, and every domain `.nest(...)`), consumed by `main.rs` and `checklist_tests.rs` |
| `src/routes/health.rs` | Health endpoint |
| `src/auth/` | Thin facade re-exporting `authentication/`, `security/password.rs`+`tokens.rs`, and `modules/auth/` from one place — see `src/auth/README.md`. Does not itself contain logic |
| `src/dev_seed*.rs` | Development-only deterministic test fixture (used by `checklist_tests.rs`) |
| `src/dev_demo_data.rs` | Development-only isolated demo business account: historical backfill plus a live-traffic background worker |

`mbam-api/docs/AUTHENTICATION_DESIGN.md` documents the auth/OAuth/invite
design; `mbam-api/README.md` and `mbam-api/README_MAC_DEBUG.md` cover local
setup; `mbam-api/DEVELOPMENT_TEST_ACCOUNTS.md` lists the `dev_seed.rs`
dashboard-test credentials (the separate `dev_demo_data.rs` demo account's
credentials are documented in `debug.log`/`docs/ENGINEERING_DEBUG_LOG.md`'s
2026-07-03 entry, not a standalone file).

### Active API domains

Each domain follows `routes -> service -> repository -> database`; `model.rs`
contains request/response/database contracts.

| Module | Routes / ownership |
| --- | --- |
| `modules/auth/` | Signup, login, refresh, logout, OAuth, reset, offline grants |
| `modules/authorization/` | Current-user authorization bootstrap and server-approved routes |
| `modules/businesses/` | Scoped business listing and creation |
| `modules/business_units/` | Scoped shop/unit listing, creation, update |
| `modules/products/` | Scoped catalogue CRUD and product sync records |
| `modules/stock/` | Manual stock-movement ledger (purchases/adjustments/transfers) plus `products.stock_policy`; sale-driven deductions are written by `modules/transactions/` instead. Fronted by `mbam-web`'s `/stock` page — see `pages/stock/` and `services/stockService.ts` below |
| `modules/team/` | Employees, memberships, roles, permissions, invitations |
| `modules/transactions/` | Transactions, drafts, details, invoices, sale-driven stock deduction |
| `modules/sync/` | Device-bound offline push/pull and conflict validation |

Users, business accounts, memberships, roles, and permissions are relational
concepts handled by `auth/` and `team/`; they intentionally do not have empty
parallel modules.

The active Keycloak provider boundary lives in `src/authentication/`. It
validates tokens by confidential-client introspection, maps verified subjects
to active local users, loads membership-scoped grants, rejects baseline-role
conflicts, and provides the reusable request authorization context. `src/auth/`
re-exports this module (plus `security/` and `modules/auth/`) as a single
facade; it is not a separate implementation.

### Database

`migrations/0001...0014` are ordered schema history. Never edit an applied
migration; add a new numbered migration.

## React PWA: `mbam-web`

### Entrypoints

| Path | Responsibility |
| --- | --- |
| `src/main.tsx` | Observability initialization and React root |
| `src/App.tsx` | Thin shell: mounts `BrowserRouter` around `routing/AppRoutes.tsx` |
| `src/routing/` | Composition root for the route table (`AppRoutes.tsx`), route guarding (`ProtectedRoute.tsx`), and navigation/display permission checks (`accessControl.ts`) — see `src/routing/README.md` |
| `src/auth/index.ts` | Thin barrel re-exporting the auth-related services (`authService`, `authSessionStore`, `authorizationService`, `keycloakService`, `deviceBindingService`, offline auth/vault services) from one place — see `src/auth/README.md`. Does not itself contain logic |
| `src/observability.ts` | Sentry scrubbing and frontend logger bootstrap |

### UI

| Path | Responsibility |
| --- | --- |
| `components/app/` | Shell, language controls (route protection now lives in `routing/`) |
| `components/auth/` | Authentication forms and layout |
| `pages/auth/` | Login/signup, access bootstrap, invite/reset flows |
| `pages/dashboard/` | Role baselines, routing, metrics, pending payments |
| `pages/business/` | Business and unit structure |
| `pages/products/` | Product catalogue, imports, revenue, inventory view, per-product stock policy |
| `pages/stock/` | Stock movement ledger (filterable by product/shop) and manual record-movement form. Its own permission scope (`screen.stock`, `stock.movement.view`, `stock.movement.create`) lets the ledger view and the record-movement action be granted independently — see `routing/accessControl.ts`'s `routeAlternatePermission` and `pages/team/TeamAccessPage.tsx`'s split `stockView`/`stockCreate` toggles |
| `pages/team/` | Employee access, roles, permissions, invitations |
| `pages/transactions/` | Entry, drafts, list, and invoices |
| `pages/reports/` | Scoped reporting shell |

### Security and data

| Path | Responsibility |
| --- | --- |
| `routing/accessControl.ts` | Client-side navigation/display restrictions (moved from the former `security/` folder) |
| `services/apiClient.ts` | Authenticated HTTP, device headers, safe errors |
| `services/auth*.ts` | Sessions and cloud/offline authentication (re-exported as a group via `src/auth/index.ts`) |
| `services/authorizationService.ts` | Sole online authorization bootstrap adapter |
| `services/deviceBindingService.ts` | Browser device identity |
| `services/encryptionService.ts` | Web Crypto encryption and key wrapping |
| `services/offlineVaultService.ts` | In-memory unlocked data key |
| `services/offlineDatabase.ts` | Primary encrypted IndexedDB schema |
| `services/offlineSyncService.ts` | Scoped push/pull synchronization |
| `services/offline*SnapshotService.ts` | Offline authorization/grant validation |
| `services/customers/` | Scoped encrypted customer persistence |
| `services/transactions/` | Scoped encrypted local transactions and merge |
| `services/stock/` | Offline queue for manual stock movements recorded while offline; syncs against the `modules/stock/` ledger via the generic `stock_movement` entity type in `services/offlineSyncService.ts`/`modules/sync/` |
| `services/receiptImport/` | Offline receipt-image queue groundwork (no backend module yet, see docs/future-receipt-import.md) |
| `services/localSync/` | Role-policy metadata and browser cache records |
| `services/logging/` | Redacted console, IndexedDB buffer, Sentry forwarding |

### Canonical frontend contracts

| Path | Responsibility |
| --- | --- |
| `types/auth.ts` | Cloud session and identity contracts |
| `types/offline.types.ts` | Encrypted records, grants, sync operations |
| `types/workspace.ts` | Current business/team/product/transaction UI contracts |

There is no parallel class-based `models/` layer. Use these contracts and the
service transformations that produce them.

### Development fallback data

`data/mockWorkspace.ts` and `data/mockProductSales.ts` support development and
offline/demo fallbacks. They are never an authorization source.

## Security boundaries

- PostgreSQL is reachable only through the Rust API.
- The API validates identity, permission, account/business/unit scope, and
  device binding; frontend checks are usability controls, not authority.
- Refresh tokens are opaque, hashed in PostgreSQL, and sent in HttpOnly cookies.
- Sensitive offline records are encrypted before IndexedDB persistence.
- Logs redact secrets and personal/customer data.
- Role, permission, invitation, and access changes are never queued offline.
- Production startup rejects missing required configuration, invalid positive
  durations/ports, and access-token secrets shorter than 32 characters.

## Verification commands

```bash
cd mbam-api
cargo check
cargo test
cargo clippy --all-targets

cd ../mbam-web
npm run type-check
npm run lint
npm test
npm run build
```

Update this file whenever an active module is added, removed, renamed, or its
ownership changes.
