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
