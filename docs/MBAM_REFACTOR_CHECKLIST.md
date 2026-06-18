# MBAM Security And Product Refactor Checklist

This page is the completion ledger for the 17-point refactor. A checkbox is
marked only after the implementation and its relevant verification pass.

Last updated: 2026-06-19 UTC

## 1. Architecture Boundaries

- [x] Document Keycloak ownership of credentials, sessions, recovery, MFA,
      federation, token lifecycle, and baseline role claims.
- [x] Document MBAM ownership of memberships, tenant/shop scope, domain
      permissions, custom additive permissions, business data, offline
      authorization, versioning, and audit records.
- [x] Enforce the identity + baseline role + active membership + scope +
      permission intersection for protected API routes.
- [x] Fail closed on missing, unknown, stale, or conflicting authorization data.

## 2. Central Authentication Layer

- [x] Centralize bearer parsing and protected-route authentication.
- [x] Validate Keycloak active state, issuer, audience, expiry, subject, and
      required baseline role claims.
- [x] Resolve immutable Keycloak subjects to active MBAM users.
- [x] Load active memberships, roles, permissions, businesses, and units.
- [x] Reject Keycloak/MBAM baseline mismatches.
- [x] Return a normalized authorization context.
- [x] Document configuration, provisioning, migration, failures, and tests.
- [ ] Move browser authentication, recovery, refresh, and logout fully to
      Keycloak before removing legacy authentication.

## 3. Authorization Context And Guards

- [x] Include user ID, Keycloak subject, baseline role, permissions,
      membership IDs, business IDs, unit IDs, and authorization version.
- [x] Implement baseline-role, permission, business, business-unit,
      transaction, and employee-management guards.
- [x] Preserve service/repository authorization independently of route guards.
- [x] Use 401, 403, and tenant-safe 404 behavior.

## 4. Authorization Bootstrap

- [x] Add `GET /api/v1/me/authorization`.
- [x] Return only current-user identity, role, permissions, scope, dashboard,
      routes, and authorization version.
- [x] Use the endpoint as the sole online frontend authorization bootstrap.
- [x] Prevent stale local permissions from restoring server-denied routes.

## 5. Shop Manager Rules

- [x] Restrict employee visibility to cashiers in assigned shops.
- [x] Restrict employee creation/editing to cashier baseline in assigned shops.
- [x] Deny custom permission grants by shop managers.
- [x] Restrict products and transactions by API shop scope.
- [x] Enforce scoped transaction detail access.
- [x] Add scoped reporting endpoints and prove shop managers cannot access
      business/account-wide aggregates.
- [ ] Add complete URL/API manipulation integration tests across all shop
      resources.

## 6. Employee Management

- [x] Rename the navigation and interface to Employees.
- [x] Enforce the employee visibility matrix in the API.
- [x] Show shop managers only the cashier role.
- [x] Deny employee management to cashiers.
- [ ] Replace local/Keycloak role mutation with a transactional outbox and
      reconciliation worker.
- [ ] Surface visible synchronization failures and retry state.

## 7. Dashboard Baselines

- [x] Provide master-owner, business-admin, shop-manager, and cashier baseline
      dashboard routes.
- [x] Display the authenticated user's name and role in the workspace header.
- [ ] Remove all obsolete baseline/signed-in/authorized-tools presentation.
- [ ] Make every metric cell accessible, named, clickable, and linked to an
      authorized detail route.
- [ ] Enforce direct detail URLs with the same API authorization.

## 8. Dashboard Metric Cells

- [ ] Add authorized daily business, shop, employee, and product leaders.
- [ ] Add role-appropriate shop-manager and cashier metrics.
- [ ] Add entity names, primary values, chart previews, accessible buttons,
      links, loading, empty, timeout, and error states.

## 9. Recent Transactions

- [x] Enforce cashier ownership and shop-manager shop scope in transaction APIs.
- [ ] Add a newest-first, maximum-five dashboard table for cashiers and shop
      managers only.
- [ ] Link each row to the exact authorized transaction detail.
- [ ] Hide the section from master owners and business administrators.

## 10. Reporting And Charts

- [ ] Add `chart.js` and `react-chartjs-2`.
- [x] Add API aggregations for business revenue, shop revenue, employee sales,
      product quantity, and product revenue.
- [x] Support daily, weekly, monthly, and yearly timeframes.
- [x] Add reporting indexes for business, unit, recorder, product, and time.
- [ ] Add a single-select segmented timeframe control.
- [x] Keep authoritative calculations entirely on the API.

## 11. Detail Pages

- [ ] Restrict Businesses to master owners and business administrators.
- [ ] Add the responsive authorized Shops split list/chart page.
- [ ] Add the responsive authorized Employees split list/chart page.
- [ ] Add the responsive authorized Products split list/chart page.
- [ ] Ensure selected entity IDs cannot escape API scope.

## 12. Role Visibility Matrix

- [x] Enforce Businesses visibility for master/business-admin roles only in
      authorized navigation.
- [x] Enforce Employees visibility for master, business admin, and scoped shop
      managers.
- [x] Enforce products and transactions with business/unit/owner scope.
- [x] Enforce the complete reports matrix with scoped aggregation APIs.
- [ ] Add matrix-wide API and frontend integration tests.

## 13. Offline Authorization

- [x] Store user, baseline role, permissions, business/unit scope,
      authorization version, and device binding in encrypted snapshots.
- [x] Reject invalid device bindings.
- [x] Prevent employee/role-management operations from being queued offline.
- [x] Add explicit snapshot expiry and fail-closed expiry tests.
- [x] Revalidate every queued operation against current authorization during
      synchronization.
- [ ] Reject and audit queued operations outside the current scope.

## 14. Auditing And Observability

- [x] Redact tokens, passwords, cookies, authorization headers, secrets, and
      customer-sensitive fields from logs.
- [x] Maintain `debug.log`, `error.log`, and `docs/ENGINEERING_DEBUG_LOG.md`.
- [ ] Audit login/logout, role/scope changes, employee creation/disabling,
      Keycloak synchronization failures, cross-scope denials, and all product
      and transaction modifications.
- [ ] Add tests for required audit events and prohibited log content.

## 15. Required Tests

- [x] Keycloak/MBAM role mismatch, missing role, unknown role, and missing
      membership fail closed in authorization-context tests.
- [x] Shop managers cannot grant roles above cashier.
- [x] Cashiers cannot open another user's transaction.
- [x] Authorization version changes on membership updates.
- [ ] Add database-backed tests for every cross-shop and cross-business case.
- [x] Add chart authorization and date/time boundary tests.
- [x] Add offline snapshot expiry and queued-operation revalidation tests.
- [ ] Add loading, empty, timeout, and API-error stale-data tests.
- [ ] Add direct-detail-route authorization tests.

## 16. Implementation Order

- [x] Central Keycloak authentication and normalized authorization context.
- [x] API scope guards and focused denial tests.
- [x] Authorization bootstrap endpoint.
- [x] Scoped employee-management API and UI.
- [ ] Scoped recent transaction dashboard table.
- [x] Reporting aggregation endpoints and indexes.
- [ ] Dashboard metric cleanup and clickable cells.
- [ ] Shop, employee, and product graph pages.
- [ ] Keycloak role-management outbox and reconciliation.
- [x] Offline authorization revalidation.
- [ ] Remove legacy authentication only after migration tests pass.

## 17. Conflict Resolution Priority

- [x] Use tenant isolation, least privilege, server-side enforcement,
      fail-closed behavior, single source of truth, transactional consistency,
      scalability, offline safety, and UI simplicity—in that order—when
      requirements conflict.
