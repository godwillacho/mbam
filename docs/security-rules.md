# Mbam Security Rules

This document defines security rules for the Mbam application. These rules apply to every frontend, backend, API, and offline-first storage feature added to the project.

## 1. Authorization rules

- Never rely on frontend-only role checks for real security.
- The frontend may hide unavailable actions, but the backend must enforce every permission again.
- Every protected API route must check the authenticated user, role, and business/unit scope.
- A user must never be able to access another business, unit, customer, transaction, team member, report, or pending-payment record by changing a URL or request payload.
- Direct URL access must either return the permitted scoped data or redirect/deny access.

## 2. Authentication and session rules

- Do not store long-lived access tokens in `localStorage` in production.
- Prefer short-lived access tokens in memory and refresh tokens in secure, HttpOnly, SameSite cookies.
- Never trust user, role, or scope values read from local storage.
- OAuth and SSO flows must validate state/nonce values and redirect URIs.
- Password reset and verification endpoints must not reveal whether an email exists.

## 3. Input validation rules

Every input must be validated at two boundaries:

1. Client-side validation for user experience.
2. Server-side validation for security.

Validation must include:

- Required fields.
- Type checks.
- Length limits.
- Numeric ranges.
- Enum allowlists.
- Date parsing and date range sanity checks.
- Business/unit/customer ownership checks.
- Text normalization and sanitization before storage.

Client-side validation must use shared helpers from `src/utils/validation.ts` where possible.

## 4. Output encoding and XSS rules

- Do not use `dangerouslySetInnerHTML` unless a security review approves it.
- Never render raw HTML from user input.
- Keep React output escaped by default.
- Treat customer names, notes, product names, and business names as untrusted data.
- Sanitize text before storing and encode again at render boundaries if rendering outside React.

## 5. Offline-first and local data rules

- Offline data is not a security boundary.
- Local data can be modified by the user and must be revalidated during sync.
- Sync endpoints must reject tampered IDs, prices, quantities, payment status, user roles, and scope fields.
- Pending offline records must include a server-verifiable authenticated user and business/unit scope during sync.
- Local-only mock authentication must never be used in production mode.

## 6. Financial transaction rules

- Prices, quantities, totals, outstanding balances, and payment dates must be validated server-side.
- The server must recompute totals from line items instead of trusting client totals.
- Outstanding amount cannot exceed total amount.
- Quantity must be greater than zero.
- Amounts must be non-negative and below configured business limits.
- Currency must come from the business configuration, not arbitrary user input.
- Every financial change must be audit logged with user, timestamp, device/session, and previous/new values.

## 7. API security rules

- All API endpoints must require authentication unless explicitly public.
- All API endpoints must use HTTPS in production.
- Use CSRF protection for cookie-authenticated state-changing requests.
- Rate limit authentication, password reset, sync, and transaction creation endpoints.
- Return generic error messages to users; log detailed errors server-side only.
- Do not expose stack traces, SQL errors, secrets, or internal service names in API responses.

## 8. Dependency and supply-chain rules

- Commit lockfiles for every package-managed app.
- Run dependency audit in CI for frontend and backend packages.
- Pin major versions and review breaking upgrades.
- Remove unused dependencies.
- Do not install packages that are unmaintained, typosquatted, or unnecessary.

## 9. Secrets and configuration rules

- No secrets, API keys, private URLs, tokens, or credentials may be committed.
- All environment variables must use `.env.example` documentation.
- Production secrets must come from a secret manager or deployment environment.
- Sentry DSNs and public config are allowed only if intentionally public and documented.

## 10. Required security checks before merge

Every pull request that touches auth, roles, payments, transactions, sync, reports, or customer data must include:

- Input validation review.
- Authorization/scope review.
- XSS review for rendered fields.
- Dependency impact review.
- Tests for unauthorized direct URL/API access.
- Tests for invalid amounts, invalid dates, empty strings, overlong strings, and invalid enum values.
