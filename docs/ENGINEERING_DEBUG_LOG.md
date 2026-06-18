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

## 2026-06-18 - Keycloak Authentication Boundary

**Branch:** `codex/keycloak-auth-layer`

**Requested behavior:** Refactor authentication and baseline role validation
toward Keycloak, create a dedicated authentication directory with detailed
documentation, and comment every function in that layer.

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

**Errors encountered:**

- GitHub code search returned no results for known authentication helpers.
- Two updates returned HTTP 409 because create-file responses did not expose the
  current content blob SHA; the files were re-fetched and updated safely.
- The private repository archive could not be downloaded into the execution
  workspace and returned HTTP 403.

**Checks not run:**

- `cargo fmt --check`
- `cargo check`
- `cargo test`
- Live Keycloak introspection and role-claim integration tests

**Remaining risks and follow-up:**

- Browser login still uses the legacy Mbam authentication UI. Authorization Code
  with PKCE is Phase 2 and must be completed before enabling Keycloak in production.
- Baseline role edits still mutate local records. Keycloak Admin API synchronization
  requires a transactional outbox and is Phase 3; an unsafe direct dual write was
  intentionally not introduced.
- Legacy JWT secrets remain required during migration because device context and
  offline grant behavior still depend on existing code.
- Token introspection makes Keycloak availability part of online API availability.
- Run the Rust checks locally, provision test-user Keycloak subjects, and execute
  cross-unit denial tests before merging into a production release.

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
