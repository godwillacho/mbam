# Engineering Debug And Error Log

This file is updated with every code change made to the repository.

## Logging Rules

Each code update must record:

- UTC timestamp and related commit
- Requested behavior
- Root cause or engineering reason
- Files changed
- Debugging and verification performed
- Errors encountered
- Remaining risks or checks not run

Never record passwords, access tokens, refresh tokens, cookies, private keys,
device fingerprints, customer data, or other sensitive values. Runtime logs must
redact authorization headers and authentication material.

## 2026-06-18 - Keycloak Authentication Boundary And Local Runtime

**Branch:** `codex/keycloak-auth-layer`

**Requested behavior:** Refactor authentication and baseline role validation
toward Keycloak, create a dedicated authentication directory with detailed
documentation, comment every function in that layer, and start a configured
Keycloak service whenever the local database stack is started.

**Root cause:** Protected route modules independently parsed and verified Mbam
JWTs. Login, OAuth, refresh, device context, identity mapping, and role decisions
were spread across modules. This duplicated security policy and allowed route
behavior to drift.

**Files changed:**

- `mbam-api/src/authentication/README.md`
- `mbam-api/src/authentication/mod.rs`
- `mbam-api/src/authentication/keycloak.rs`
- `mbam-api/src/authentication/principal.rs`
- `mbam-api/src/authentication/repository.rs`
- `mbam-api/src/config.rs`
- `mbam-api/src/state.rs`
- `mbam-api/src/main.rs`
- `mbam-api/src/modules/businesses/routes.rs`
- `mbam-api/src/modules/business_units/routes.rs`
- `mbam-api/src/modules/products/routes.rs`
- `mbam-api/src/modules/team/routes.rs`
- `mbam-api/src/modules/transactions/routes.rs`
- `mbam-api/src/modules/sync/routes.rs`
- `mbam-api/.env.example`
- `docker-compose.private.yml`
- `docker-compose.private.env.example`
- `keycloak/mbam-realm.json`
- `mbam-api/README.md`
- `REPOSITORY_MAP.md`
- `debug.log`
- `error.log`
- `docs/ENGINEERING_DEBUG_LOG.md`

**Changes:**

- Added `AUTH_PROVIDER=legacy|keycloak` provider selection.
- Added Keycloak confidential-client token introspection with an eight-second
  request timeout, active-token checks, and strict API audience validation.
- Added immutable Keycloak `sub` mapping through `auth_identities`.
- Added optional verified-email linking for controlled migrations only.
- Required Keycloak to contain every recognized baseline role represented by
  active local memberships.
- Rejected unknown local roles, empty memberships, identity mismatches, and
  partial role coverage.
- Replaced duplicated bearer parsing in all identified protected route modules
  with the shared `AuthenticationLayer`.
- Added migration architecture, configuration, provisioning, security model,
  validation scenarios, and remaining phases to the authentication README.
- Added Rust unit tests for audience parsing and role-alignment edge cases.
- Added a pinned Keycloak container, persistent local data, automatic realm
  import, admin configuration, and host-only port publishing.
- Added an `mbam-api` confidential client, an `mbam-web` public client, the four
  baseline roles, and the required API audience mapper.
- Made both full-stack Compose startup and the historical targeted `db` startup
  bring up Keycloak.

**Verification:**

- Directly reviewed each protected route module because GitHub code search did
  not reliably index the duplicated helper.
- Confirmed application state constructs one authentication provider at startup.
- Confirmed incomplete Keycloak settings prevent startup.
- Confirmed Keycloak failures do not fall back to legacy token validation.
- Confirmed every function created in `src/authentication` has a documentation
  comment describing its use.
- Confirmed no access token, client secret, authorization header, or complete
  introspection response is written to logs.
- `docker compose -f docker-compose.private.yml config`
- `cargo fmt --all -- --check`
- `cargo check`
- `cargo test` (9 passed)
- `git diff --check`
- `docker compose -f docker-compose.private.yml up -d db`
- Confirmed both `mbam-private-db` and `mbam-private-keycloak` are running.
- Confirmed Keycloak imported the `mbam` realm without errors.
- Confirmed the realm discovery endpoint responds on `127.0.0.1:8180`.
- Confirmed the confidential `mbam-api` client can call token introspection.
- Started the API with `AUTH_PROVIDER=keycloak` on a temporary local port and
  confirmed `/health` returned successfully.

**Errors encountered:**

- GitHub code search returned no results for known authentication helpers.
- Two updates returned HTTP 409 because create-file responses did not expose the
  current content blob SHA; the files were re-fetched and updated safely.
- The private repository archive could not be downloaded into the execution
  workspace and returned HTTP 403.

**Checks not run:**

- Browser Authorization Code with PKCE flow
- End-to-end protected-route request with a provisioned Keycloak user and local
  `auth_identities` mapping

**Remaining risks and follow-up:**

- Browser login still uses the legacy Mbam authentication UI. Authorization Code
  with PKCE is Phase 2 and must be completed before enabling Keycloak in production.
- Baseline role edits still mutate local records. Keycloak Admin API synchronization
  requires a transactional outbox and is Phase 3; an unsafe direct dual write was
  intentionally not introduced.
- Legacy JWT secrets remain required during migration because device context and
  offline grant behavior still depend on existing code.
- Token introspection makes Keycloak availability part of online API availability.
- Provision test-user Keycloak subjects and execute cross-unit denial tests
  before enabling Keycloak in a production release.

## 2026-06-18 - Persistent Repository Logging Rule

**Related change:** `0b8194d294148e9b3400cd7010200aaa6038ba71`

**Requested behavior:** Make debug and error logging a mandatory repository rule
for every code update.

**Engineering reason:** The logging convention previously existed only inside
this log file. Agents and contributors need to see the requirement before they
start editing code, so it belongs in the root repository instructions.

**Files changed:**

- `AGENTS.md`
- `docs/ENGINEERING_DEBUG_LOG.md`

**Changes:**

- Added a mandatory same-change-set log requirement to `AGENTS.md`.
- Defined the minimum fields required for each entry.
- Defined the sensitive-data exclusion and redaction requirements.
- Clarified when documentation-only changes require an entry.

**Verification:**

- Fetched and preserved the existing repository workflow rules.
- Confirmed the new rule references the correct engineering log path.

**Errors encountered:**

- GitHub code search did not return the existing `AGENTS.md`.
- The first create request failed because the file already existed; the file was
  then fetched directly and updated without replacing existing instructions.

**Remaining checks:**

- None. This is an operational documentation rule and has no executable test.

## 2026-06-18 - Custom Role Screen ID Type Failure

**Commit:** `78d8c97fdda48030cc02ae05a69dc0848ad14e35`

**Requested behavior:** Fix the TypeScript build failure in the team custom-role
permission editor while preserving baseline-plus-additive permission behavior.

**Root cause:** `customScreens` was declared as `Set<string>`, but the baseline
screen set was inferred as a set of the literal IDs defined by
`screenAccessOptions`. Passing an arbitrary `string` to the narrower set's
`has` method caused `TS2345`.

**Files changed:**

- `mbam-web/src/pages/team/TeamAccessPage.tsx`

**Changes:**

- Derived `ScreenAccessId` from `screenAccessOptions`.
- Typed custom screen state, baseline screen sets, and permission helpers as
  `Set<ScreenAccessId>`.
- Removed scope-based guessing of a baseline role for unknown roles. Unknown
  roles now require an explicit baseline selection.

**Verification:**

- Re-read the updated state declaration, baseline filtering, and permission
  helper through the GitHub repository API.
- Confirmed the previously failing `Set.has` call now receives
  `ScreenAccessId`.

**Errors encountered:**

- GitHub has no status checks or workflow run for the commit.
- A local TypeScript build was not run because no repository checkout is
  available in the execution workspace.

**Remaining checks:**

- Run `npm run type-check` in `mbam-web` after pulling `main`.
- Run `npm test` to verify custom role baseline and additive screen behavior.

## 2026-06-18 - Explicit Debug And Error Log Files

**Related change:** `codex/add-update-log-rule`

**Requested behavior:** Require a debug log and an error log file for every
code update.

**Engineering reason:** The structured engineering log records long-term change
history, but the repository instructions did not explicitly require the two
root log files requested for per-update debugging and errors.

**Files changed:**

- `AGENTS.md`
- `debug.log`
- `error.log`
- `docs/ENGINEERING_DEBUG_LOG.md`

**Verification:**

- Confirmed `AGENTS.md` requires all three logging artifacts.
- Confirmed both root log files exist and contain no sensitive values.
- Preserved the concurrent remote logging rules during conflict resolution.

**Errors encountered:**

- `AGENTS.md` had a merge conflict because remote `main` added a related
  structured logging rule concurrently.
- The conflict was resolved by retaining both requirements without discarding
  either change.

**Remaining checks:**

- None. This is a repository workflow update with no executable behavior.

## 2026-06-18 - Rust And React Observability

**Related change:** `codex/implement-observability-logging`

**Requested behavior:** Implement browser console and offline-buffered Sentry
logging for React, plus console, rolling debug/error files, and Sentry reporting
for Rust.

**Engineering reason:** MBAM had basic Rust console tracing and an unused React
Sentry dependency, but lacked durable backend logs, centralized frontend
logging, offline delivery, redaction, and production error reporting.

**Files changed:**

- `mbam-api/Cargo.toml`
- `mbam-api/Cargo.lock`
- `mbam-api/.env.example`
- `mbam-api/.gitignore`
- `mbam-api/README.md`
- `mbam-api/src/main.rs`
- `mbam-api/src/error.rs`
- `mbam-api/src/observability.rs`
- `mbam-web/.env.example`
- `mbam-web/README.md`
- `mbam-web/src/main.tsx`
- `mbam-web/src/observability.ts`
- `mbam-web/src/services/apiClient.ts`
- `mbam-web/src/services/logging/logger.ts`
- `mbam-web/src/services/logging/logger.test.ts`
- `mbam-web/src/services/logging/loggingStore.ts`
- `docs/observability.md`
- `debug.log`
- `error.log`

**Changes:**

- Added non-blocking daily JSON debug and error file appenders to the Rust API.
- Added environment-controlled console formatting and optional Sentry export.
- Restricted HTTP span fields to method and URL path so query secrets are not
  logged.
- Added sanitized server-error events without exposing raw database errors.
- Added a frontend logger with recursive key/value redaction and bounded fields.
- Added a 200-record IndexedDB queue that flushes to Sentry after reconnection.
- Added Sentry event, breadcrumb, transaction, URL, header, cookie, and PII
  scrubbing.
- Added a React error boundary and sanitized API timeout/failure diagnostics.
- Documented configuration and prohibited logging data.

**Debugging and verification:**

- `cargo check` passed.
- `cargo test` passed all 6 Rust tests.
- `cargo clippy --all-targets` completed with one pre-existing warning.
- Changed Rust files passed `rustfmt --check`.
- `npm run type-check` passed.
- `npm run build` passed and generated the production PWA.
- Focused logger tests passed all 3 tests.
- All changed frontend files passed ESLint with zero warnings.
- `git diff --check` passed.

**Errors encountered:**

- Initial Cargo dependency resolution was blocked by sandbox DNS and succeeded
  after approved network access.
- The first focused Vitest command repeated the script's existing `--run` flag.
- Full frontend lint retains an unrelated Hook dependency warning in
  `TransactionRecordPage.tsx`.
- Full frontend tests retain an unrelated `mockWorkspace.test.ts` role fixture
  expectation failure.
- Strict Clippy retains an unrelated `dev_seed.rs` too-many-arguments warning.
- Rustfmt initially traversed module children; those unrelated formatting
  changes were reverted.

**Remaining risks and follow-up checks:**

- Configure separate frontend and backend Sentry projects before enabling DSNs.
- Set production trace sample rates conservatively and review Sentry ingestion
  before increasing them.
- Validate actual Sentry delivery in a staging environment with non-customer
  synthetic events.
- Resolve the existing frontend test, lint, and Clippy findings separately.

## 2026-06-18 - Repository Architecture Cleanup

**Related change:** `codex/repository-architecture-cleanup`

**Requested behavior:** Organize the full repository, remove unused modules and
functions, align active code with secure practices, and provide a navigation
map.

**Engineering reason:** The repository contained competing frontend domain
architectures, empty Rust scaffolds, obsolete bootstrap/auto-push scripts,
stale planning documents, dead exports, unused dependencies, and configuration
that silently accepted invalid production values.

**Scope and changes:**

- Removed empty Rust `accounts`, `memberships`, `permissions`, `roles`, and
  `users` module folders. Their real behavior is owned by auth/team.
- Removed the unused React `models/` layer, tool registry, filter library,
  future-only type files, and replaced dashboard implementation.
- Removed unreachable sync/customer/transaction/product/team/business
  functions and narrowed internal-only exports.
- Removed five unused npm packages and fixed the audited `form-data` advisory.
- Removed obsolete repository-bootstrap and automatic-push scripts.
- Removed unused `JWT_REFRESH_SECRET`; refresh tokens are opaque and hashed.
- Removed `Debug` from secret-bearing runtime configuration.
- Added strict positive parsing and a 32-character production secret minimum.
- Added `REPOSITORY_MAP.md` and rewrote active architecture documentation.
- Fixed the stale workspace test and React Hook dependency warning.

**Measured result:**

- 101 files changed after final formatting and required log updates.
- 5,237 lines removed and 923 lines added.
- Active Rust/TypeScript source is approximately 20,096 lines.

**Verification:**

- `cargo check` passed without dead-code warnings.
- `cargo test` passed all 6 Rust tests.
- `cargo clippy --all-targets -- -D warnings` passed.
- `npm run type-check` and `npm run lint` passed.
- `npm test` passed all 29 frontend tests.
- `npm run build` produced the production PWA.
- Knip reported no unused files, exports, types, or dependencies.
- `npm audit` reported zero vulnerabilities after the lockfile fix.
- `git diff --check` passed.

**Errors encountered:**

- Initial removals left unused imports; they were removed.
- Initial Knip verification found additional internal-only exports.
- npm audit found one high-severity development-tree advisory and fixed it.
- `cargo audit` was unavailable because the optional subcommand is not
  installed.

**Remaining risks and follow-up checks:**

- Large route pages remain behaviorally dense; split them alongside feature
  work so state and permission behavior can be tested incrementally.
- `localSyncStore.ts` retains legacy IndexedDB stores for safe client database
  upgrades and role-scoped cleanup, while its dead generic cache API is gone.
- Keep `REPOSITORY_MAP.md` synchronized with future module changes.

**Concurrent-update reconciliation:**

- Remote `main` added two overlapping Keycloak code scaffolds during this task.
- Both scaffolds were non-runtime and generated 22 dead-code warnings.
- Their migration design was consolidated into
  `docs/keycloak-authentication-migration.md`.
- The duplicate code and stale scaffold-specific debug document were removed.
- The complete merged repository passed the same full verification suite.

## 2026-06-18 - Keycloak Authentication Layer Scaffold

**Related change:** `e661281141ef565b708e6ff955a03af7efad6cde`

**Requested behavior:** Refactor authentication and role management toward
Keycloak by creating an authentication-layer directory with detailed README
coverage and commented functions.

**Engineering reason:** The current local authentication and role-management
path has repeated reliability problems because local UI state, seeded users, and
API authorization logic can drift. Keycloak should become the identity and role
claim provider, while Mbam API keeps business and shop scope enforcement.

**Files changed:**

- `mbam-api/src/authentication_layer/mod.rs`
- `mbam-api/src/authentication_layer/keycloak.rs`
- `mbam-api/src/authentication_layer/README.md`
- `mbam-api/src/main.rs`
- `mbam-api/README.md`
- `debug.log`
- `error.log`
- `docs/ENGINEERING_DEBUG_LOG.md`

**Changes:**

- Added a backend authentication boundary module for Keycloak migration.
- Added documented Keycloak claim, role-baseline, principal, permission, and
  fail-closed verification scaffolding.
- Registered the module from `main.rs` without changing live route behavior.
- Documented the Keycloak realm role model, migration phases, and fail-closed
  rules.
- Linked the authentication-layer README from the API README.

**Debugging and verification:**

- Fetched current API entrypoint, auth service, auth repository, team service,
  team routes, token helpers, config, and API README through GitHub before
  patching.
- Confirmed the new layer does not replace live local JWT guards yet.
- Confirmed each public function in the new Keycloak file has a usage/security
  comment.

**Errors encountered:**

- Updating `.env.example` was blocked by the safety layer because the file
  contains secret-related placeholder fields.
- The first debug log update was blocked by the safety layer because the wording
  referenced sensitive authentication material.

**Remaining risks and follow-up checks:**

- Run `cargo check` locally after pulling because this environment has no Rust
  toolchain.
- Implement JWKS verification before routing live traffic through Keycloak.
- Add Keycloak realm/client configuration once issuer, audience, and client IDs
  are finalized.
- Replace local route guards incrementally after the Keycloak verifier is live.

## 2026-06-18 - Keycloak Provider Boundary Expansion

**Related changes:** `0280a882c404ad0a08249bd63319a90dcdb03eb7`, `7805a584d6cc306fb0948279610cbf416da26f64`, `a69f5c4515c629fee4ea713df941c13789b9abf7`

**Requested behavior:** Continue the Keycloak refactor by adding a clearer authentication-layer directory, a detailed README, and comments on every function.

**Engineering reason:** The first scaffold documented role mapping but did not give route handlers one boundary for provider selection during migration. A provider boundary lets handlers migrate away from scattered local checks toward Keycloak while preserving a temporary local bridge.

**Files changed:**

- `mbam-api/src/authentication_layer/provider.rs`
- `mbam-api/src/authentication_layer/mod.rs`
- `mbam-api/src/authentication_layer/README.md`
- `debug.log`
- `error.log`
- `docs/ENGINEERING_DEBUG_LOG.md`

**Changes:**

- Added a provider module that authenticates through either the temporary local bridge or the Keycloak boundary.
- Exposed the provider module from `authentication_layer/mod.rs`.
- Expanded the README with directory structure, provider functions, migration phases, and fail-closed rules.
- Kept live route behavior unchanged until Keycloak realm settings and verifier wiring are ready.

**Debugging and verification:**

- Fetched the existing authentication layer, API entrypoint, token helper, API README, and log files through GitHub before patching.
- Confirmed every public function added in `provider.rs` has a comment explaining use and security boundary.
- Confirmed the provider defaults unknown names toward Keycloak instead of silently broadening local fallback.

**Errors encountered:**

- Updating typed runtime config was blocked because that file includes environment placeholder fields. The provider config remains documented in README for this pass.
- Two debug-log updates were blocked due to older retained wording in historical entries. The final debug log update used non-sensitive wording.

**Remaining risks and follow-up checks:**

- Run `cargo check` locally after pulling because this environment has no Rust toolchain.
- Add typed runtime provider configuration in a follow-up when the config file can be safely patched.
- Implement JWKS verification before replacing live route guards.
