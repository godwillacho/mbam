# MBAM Repository Map

This is the navigation map for the running MBAM codebase. It describes active
modules only. Database migrations and future-planning documents remain
historical/product references, not runtime modules.

## Runtime overview

```text
React PWA
  App.tsx routes
    -> pages
      -> security/accessControl.ts
      -> services
        -> HTTP API
        -> encrypted IndexedDB/offline sync

Rust API
  main.rs
    -> configuration + observability + PostgreSQL
    -> Axum routers
      -> domain routes
        -> services
          -> repositories
            -> PostgreSQL
```

## Root

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Mandatory repository workflow and logging rules |
| `REPOSITORY_MAP.md` | This living navigation map |
| `docker-compose.private.yml` | Local PostgreSQL only |
| `docs/` | Security, observability, testing, and future-product documents |
| `debug.log`, `error.log` | Required engineering change records |
| `.github/workflows/` | API, security, and integration automation |

Generated local directories such as `mbam-api/target`, `mbam-web/node_modules`,
and `mbam-web/dist` are not source modules and can be recreated.

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
| `src/routes/health.rs` | Health endpoint |
| `src/dev_seed*.rs` | Development-only deterministic test fixture |

### Active API domains

Each domain follows `routes -> service -> repository -> database`; `model.rs`
contains request/response/database contracts.

| Module | Routes / ownership |
| --- | --- |
| `modules/auth/` | Signup, login, refresh, logout, OAuth, reset, offline grants |
| `modules/businesses/` | Scoped business listing and creation |
| `modules/business_units/` | Scoped shop/unit listing, creation, update |
| `modules/products/` | Scoped catalogue CRUD and product sync records |
| `modules/team/` | Employees, memberships, roles, permissions, invitations |
| `modules/transactions/` | Transactions, drafts, details, invoices |
| `modules/sync/` | Device-bound offline push/pull and conflict validation |

Users, business accounts, memberships, roles, and permissions are relational
concepts handled by `auth/` and `team/`; they intentionally do not have empty
parallel modules.

The planned Keycloak provider boundary is documented in
`docs/keycloak-authentication-migration.md`. It is intentionally not compiled
until JWKS verification and live route integration are implemented.

### Database

`migrations/0001...0009` are ordered schema history. Never edit an applied
migration; add a new numbered migration.

## React PWA: `mbam-web`

### Entrypoints

| Path | Responsibility |
| --- | --- |
| `src/main.tsx` | Observability initialization and React root |
| `src/App.tsx` | Complete route table |
| `src/observability.ts` | Sentry scrubbing and frontend logger bootstrap |

### UI

| Path | Responsibility |
| --- | --- |
| `components/app/` | Shell, route protection, language controls |
| `components/auth/` | Authentication forms and layout |
| `pages/auth/` | Login/signup, access bootstrap, invite/reset flows |
| `pages/dashboard/` | Role baselines, routing, metrics, pending payments |
| `pages/business/` | Business and unit structure |
| `pages/products/` | Product catalogue, imports, revenue, inventory view |
| `pages/team/` | Employee access, roles, permissions, invitations |
| `pages/transactions/` | Entry, drafts, list, and invoices |
| `pages/reports/` | Scoped reporting shell |

### Security and data

| Path | Responsibility |
| --- | --- |
| `security/accessControl.ts` | Client-side navigation/display restrictions |
| `services/apiClient.ts` | Authenticated HTTP, device headers, safe errors |
| `services/auth*.ts` | Sessions and cloud/offline authentication |
| `services/deviceBindingService.ts` | Browser device identity |
| `services/encryptionService.ts` | Web Crypto encryption and key wrapping |
| `services/offlineVaultService.ts` | In-memory unlocked data key |
| `services/offlineDatabase.ts` | Primary encrypted IndexedDB schema |
| `services/offlineSyncService.ts` | Scoped push/pull synchronization |
| `services/offline*SnapshotService.ts` | Offline authorization/grant validation |
| `services/customers/` | Scoped encrypted customer persistence |
| `services/transactions/` | Scoped encrypted local transactions and merge |
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
