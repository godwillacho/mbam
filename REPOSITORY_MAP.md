# MBAM Repository Map

This is the navigation map for the running MBAM codebase. Use it to jump
straight to the right file when tracking down a bug: find the layer the
symptom is in (route/UI, service/business logic, or data), then the domain
(auth, stock, team, etc.), and this map points at the exact folder. It
describes active modules only. Database migrations and future-planning
documents remain historical/product references, not runtime modules.

## Runtime overview

```text
React PWA
  App.tsx (mounts BrowserRouter only)
    -> routing/AppRoutes.tsx (the route table)
      -> routing/ProtectedRoute.tsx + routing/accessControl.ts
      -> pages/<domain>/
        -> services/<domain>/ (or auth/ for anything session/identity-related)
          -> HTTP API
          -> encrypted IndexedDB/offline sync

Rust API
  main.rs
    -> configuration + observability + PostgreSQL
    -> routes::app_router() (the router composition root)
      -> modules/<domain>/routes.rs (or auth/ for identity/session concerns)
        -> service.rs
          -> repository.rs
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
| `src/main.rs` | Process entrypoint: config, migrations, dev seeding, shared state, `routes::app_router()`, and `axum::serve` |
| `src/config.rs` | Typed environment loading and production validation |
| `src/state.rs` | Shared Axum state |
| `src/error.rs` | Safe public API errors and server-error logging |
| `src/observability.rs` | Console, rolling files, and optional Sentry |
| `src/db/pool.rs` | PostgreSQL connection pool |
| `src/routes/mod.rs` | Composition root: `app_router()` builds CORS, tracing, and every domain `.nest(...)`; consumed by `main.rs` and `checklist_tests.rs` |
| `src/routes/health.rs` | Health endpoint |
| `src/auth/` | Everything about "who is calling": identity-provider authentication, password/token security, and the legacy (non-Keycloak) auth provider. See `src/auth/README.md` for the full breakdown and the Keycloak migration design |
| `src/dev/` | Development-only fixtures and demo data (`seed.rs`, `seed_cleanup.rs`, `demo_data.rs`), gated on `app_env == "development"`. See `src/dev/README.md` |

`mbam-api/docs/AUTHENTICATION_DESIGN.md` documents the auth/OAuth/invite
design; `mbam-api/README.md` and `mbam-api/README_MAC_DEBUG.md` cover local
setup; `mbam-api/DEVELOPMENT_TEST_ACCOUNTS.md` lists the `dev/seed.rs`
dashboard-test credentials (the separate `dev/demo_data.rs` demo account's
credentials are documented in `debug.log`/`docs/ENGINEERING_DEBUG_LOG.md`'s
2026-07-03 entry, not a standalone file).

### `src/auth/` layout

| Path | Responsibility |
| --- | --- |
| `auth/mod.rs` | `AuthenticationLayer` (selects Keycloak vs. legacy-JWT at startup) and the `authenticate()`/`authorize()` entry points every protected route uses |
| `auth/context.rs` | `AuthorizationContext` (the `require_*` guard methods used by every domain route handler) and `BaselineRole` |
| `auth/principal.rs` | `AuthenticatedPrincipal` for pre-membership flows (e.g. accepting an invitation) plus bearer-token extraction |
| `auth/keycloak.rs` | `KeycloakAuthenticator`: confidential-client token introspection |
| `auth/identity_repository.rs` | Resolves a verified Keycloak subject to a local user; loads authorization user/grants |
| `auth/password.rs` | Argon2id password hashing and verification |
| `auth/tokens.rs` | Access-token, opaque refresh-token, and signed offline-grant issuance/verification |
| `auth/legacy/` | Non-Keycloak auth provider: signup/login/refresh/logout/OAuth/reset HTTP handlers, mounted at `/api/v1/auth` only when `AUTH_PROVIDER=legacy` |

### Active API domains

Each domain follows `routes -> service -> repository -> database`; `model.rs`
contains request/response/database contracts.

| Module | Routes / ownership |
| --- | --- |
| `modules/authorization/` | Current-user authorization bootstrap and server-approved routes |
| `modules/businesses/` | Scoped business listing and creation |
| `modules/business_units/` | Scoped shop/unit listing, creation, update |
| `modules/products/` | Scoped catalogue CRUD and product sync records |
| `modules/stock/` | Manual stock-movement ledger (purchases/adjustments/transfers) plus `products.stock_policy`; sale-driven deductions are written by `modules/transactions/` instead. Movements that increase quantity may also record a batch `expiry_date` (metadata only — not full FEFO lot consumption; see 0015_stock_movement_expiry.sql), surfaced via `GET /api/v1/stock/movements/expiring`. Fronted by `mbam-web`'s `/stock` page — see `pages/stock/` and `services/stock/stockService.ts` below |
| `modules/team/` | Employees, memberships, roles, permissions, invitations |
| `modules/transactions/` | Transactions, drafts, details, invoices, sale-driven stock deduction |
| `modules/sync/` | Device-bound offline push/pull and conflict validation |
| `modules/keycloak_sync/` | Background worker that pushes local baseline-role changes toward Keycloak |
| `modules/audit.rs` | Authorization/session audit-event recording |

Users, business accounts, memberships, roles, and permissions are relational
concepts handled by `auth/` and `team/`; they intentionally do not have empty
parallel modules.

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
| `src/auth/` | Everything about "who is calling": cloud/offline session lifecycle, Keycloak, device binding, offline vault/grants. See `src/auth/README.md` |
| `src/observability.ts` | Sentry scrubbing and frontend logger bootstrap |

### UI

| Path | Responsibility |
| --- | --- |
| `components/app/` | Shell, language controls (route protection lives in `routing/`) |
| `components/auth/` | Authentication forms and layout |
| `pages/auth/` | Login/signup, access bootstrap, invite/reset flows |
| `pages/dashboard/` | Role baselines, routing, metrics, pending payments |
| `pages/business/` | Business and unit structure |
| `pages/stock/` | Merged product + stock management, all at `/stock` (there is no more standalone `pages/products/` management page — `/products/manage` now redirects here). Combines the product catalogue (CRUD, CSV import, revenue table, per-product `stock_policy`) with the stock-movement ledger and manual record-movement form. Quantity is display-only in the product table now; the record-movement form is the only UI path that changes it, so every quantity change is audited and `stock_policy`-enforced. Reachable via either the `stock` or `products` route permission (`routing/ProtectedRoute.tsx`'s `altRouteKey`) so roles like cashier (which have `screen.products` but not `screen.stock`) keep product-management access; within the page, the product section, the ledger, and the record-movement form each gate independently — see `routing/accessControl.ts`'s `routeAlternatePermission` and `pages/team/TeamAccessPage.tsx`'s split `stockView`/`stockCreate` toggles |
| `pages/team/` | Employee access, roles, permissions, invitations |
| `pages/transactions/` | Entry, drafts, list, and invoices |
| `pages/reports/` | Scoped reporting shell |

### `src/auth/` layout

| Path | Responsibility |
| --- | --- |
| `auth/authService.ts` | Cloud session lifecycle: login/signup, offline-access enrollment, password reset, OAuth sign-in |
| `auth/authSessionStore.ts` | In-memory active session store |
| `auth/authSessionPersistence.ts` | Encrypted persistence of the active session across reloads |
| `auth/authorizationService.ts` | The `/api/v1/me/authorization` bootstrap adapter |
| `auth/keycloakService.ts` | Keycloak-hosted login/logout/token-refresh (supported runtime provider) |
| `auth/deviceBindingService.ts` | Per-browser device identity |
| `auth/offlineVaultService.ts` | Encrypted-at-rest offline vault |
| `auth/offlineSessionService.ts` | Signed offline authorization grants |
| `auth/offlineAuthorizationSnapshotService.ts` | Cached authorization snapshot for offline validation |
| `auth/index.ts` | Local barrel re-exporting the above |

### `services/` layout

Domain services are grouped to mirror `pages/`; a handful of cross-domain and
core-infrastructure files stay flat at `services/` root.

| Path | Responsibility |
| --- | --- |
| `services/apiClient.ts` | Authenticated HTTP, device headers, safe errors |
| `services/encryptionService.ts` | Web Crypto encryption and key wrapping |
| `services/offlineDatabase.ts` | Primary encrypted IndexedDB schema |
| `services/offlineSyncService.ts` | Scoped push/pull synchronization engine |
| `services/entityDirectoryService.ts` | Cross-domain entity search/listing for the reports entity picker (businesses/shops/employees/products) |
| `services/workspaceService.ts` | Cross-domain workspace hydration (combines auth, business, product, team, transaction data for the UI) |
| `services/business/businessService.ts` | Business/unit CRUD and cloud sync |
| `services/products/productService.ts` | Product catalogue CRUD and cloud sync |
| `services/products/productRevenueService.ts` | Product revenue reporting |
| `services/reports/reportService.ts` | Aggregate and detail report fetching |
| `services/stock/stockService.ts` | Cloud stock-movement ledger API client |
| `services/stock/stockLocalRepository.ts` | Offline queue for manual stock movements recorded while offline; syncs against the `modules/stock/` ledger via the generic `stock_movement` entity type in `services/offlineSyncService.ts`/`modules/sync/` |
| `services/team/teamService.ts` | Employees, roles, permissions, invitations |
| `services/transactions/transactionService.ts` | Cloud transaction CRUD |
| `services/transactions/transactionLocalRepository.ts`, `transactionBrowserDbService.ts` | Scoped encrypted local transactions and merge |
| `services/customers/` | Scoped encrypted customer persistence |
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
