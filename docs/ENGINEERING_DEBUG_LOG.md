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
