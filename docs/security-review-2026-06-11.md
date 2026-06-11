# Mbam Security Review — 2026-06-11

## Scope reviewed

Reviewed the current frontend codebase structure and security-sensitive areas:

- Authentication service
- API client
- Dashboard authorization and detail routes
- Pending payment report route
- Transaction recording form
- Local/offline data model
- Internationalized UI strings
- Dependency declaration in `mbam-web/package.json`

A local ZIP copy was also inspected, but that archive was stale and only contained the auth shell and a small subset of current source files. The live GitHub source was treated as the source of truth.

## Dependency scan status

`npm audit` could not be completed against the uploaded ZIP because the archive did not include a lockfile.

Required follow-up:

```bash
cd mbam-web
npm install
npm audit
npm run lint
npm run type-check
npm test
```

Security rule added: package lockfiles must be committed and dependency audit must run in CI.

## Findings

### 1. Frontend-only authorization checks

Severity: High

The dashboard had role-based UI differences, but access to dashboard detail data was not consistently protected. A user could navigate directly to some detail URLs and view data that should not be available for that role.

Fix applied:

- Added a shared dashboard permission map in `src/pages/dashboard/dashboardPermissions.ts`.
- Filtered dashboard cards by role.
- Protected generic metric detail pages.
- Protected pending-payment report page.

Remaining backend requirement:

- The backend must enforce the same role/scope permissions on every API route.
- Frontend checks are only UX protection, not a security boundary.

### 2. Role and scope trusted from local UI state

Severity: High for production, Medium for current prototype

The dashboard preview role is currently stored client-side for demo behavior. Client-side role state can be modified by the user.

Fix/workaround applied:

- Centralized permission mapping to avoid inconsistent frontend behavior.
- Detail pages now redirect if the selected preview role cannot access a metric.

Required production rule:

- Real role/scope must come from server-verified session claims.
- API responses must only return data already filtered by authenticated user scope.

### 3. Authentication data stored in localStorage

Severity: High for production

The auth service stores session data in `localStorage`. This is vulnerable to token theft if XSS ever occurs.

Fix/workaround applied:

- Added centralized auth input validation before login/signup API calls.
- Documented production session rules.

Required production rule:

- Use short-lived access tokens and HttpOnly, Secure, SameSite cookies for refresh/session tokens.
- Never store long-lived tokens in localStorage.

### 4. Inconsistent input validation

Severity: Medium

Inputs were validated per form or not validated at a shared boundary. This risks inconsistent handling of customer names, phone numbers, transaction amounts, quantities, notes, and auth payloads.

Fix applied:

- Added `src/utils/validation.ts` with centralized helpers for:
  - text normalization and sanitization
  - email validation
  - phone validation
  - password strength validation
  - positive money parsing
  - quantity parsing
  - login/signup validation
  - sale line validation
- Applied auth input validation before API calls.

Required follow-up:

- Apply the shared validators to every form submit path.
- Backend must repeat validation on every API endpoint.

### 5. Transaction form amount validation is incomplete

Severity: Medium

The transaction page uses numeric inputs with `min="0"`, but browser constraints are not enough. Users can bypass them, and totals/outstanding amounts are still client-controlled.

Recommended fix:

- Validate total amount, line-item quantities, line-item prices, customer name, contact, payment method, and outstanding amount before saving.
- Reject outstanding amount greater than total amount.
- Server must recompute totals from line items.

### 6. Pending payment data needs strict scope control

Severity: High

Pending payments are sensitive financial records. They must not be visible to cashiers or unrelated business/unit users.

Fix applied:

- Pending payment dashboard metric is removed from cashier and shop-manager views.
- Pending payment full report redirects when the selected role lacks permission.
- Pending records are filtered by business scope.

Required backend rule:

- Pending payment APIs must require explicit permission and business/unit scope checks.

### 7. Direct URL access risk

Severity: Medium/High depending on backend implementation

React routes can be accessed directly. Without route-level guards, a user can see pages hidden from navigation.

Fix applied:

- Dashboard metric detail pages redirect when unauthorized by role map.
- Pending payment page redirects when unauthorized.

Required backend rule:

- Never return unauthorized data from APIs even if a frontend route accidentally renders.

### 8. Missing CI security gates

Severity: Medium

No committed security CI workflow was confirmed during this review.

Recommended checks:

- `npm audit`
- `npm run lint`
- `npm run type-check`
- `npm test`
- Semgrep or CodeQL for static analysis
- Secret scanning
- Dependency review on pull requests

### 9. Offline sync trust boundary

Severity: High for future sync implementation

Offline-first records can be modified locally before sync.

Required rule:

- The sync API must treat all offline records as untrusted.
- Server must revalidate IDs, scope, amounts, quantities, status, user, and timestamps.
- Server must audit every accepted financial mutation.

## Immediate fixes committed

- Shared dashboard permission map.
- Dashboard permission filtering.
- Detail route permission enforcement.
- Pending payment report permission enforcement.
- Centralized input validation helpers.
- Auth payload validation before API calls.
- Project-wide security rules document.

## Next hardening tasks

1. Apply validation helpers to `TransactionRecordPage` submit handling.
2. Add route guards for non-dashboard pages: transactions, businesses, team, reports.
3. Add test cases for restricted dashboard roles.
4. Add CI workflow with lint, type-check, test, audit, and secret scanning.
5. Add backend authorization middleware once API routes are connected.
6. Replace localStorage session storage for production auth.
