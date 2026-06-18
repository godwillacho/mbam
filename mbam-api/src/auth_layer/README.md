# Authentication Layer: Keycloak Refactor Plan

This directory is the boundary for the next authentication and authorization refactor.

## Goal

Move identity, login, token validation, and role assignment out of custom application logic and into Keycloak. The MBAM API should become a resource server that trusts Keycloak-issued tokens and then applies application-specific business, business-unit, dashboard, product, transaction, and offline-sync policies.

## Why this layer exists

The current authentication and role system grew inside the application. That made it easy for UI bootstrap code, mock workspace data, local development seed data, and API role data to disagree. Keycloak gives us a dedicated identity provider and a predictable token/role source.

This layer keeps the refactor controlled:

1. `provider.rs` defines the identity-provider interface.
2. `keycloak.rs` contains Keycloak-specific behavior.
3. `claims.rs` defines the normalized token claims that the rest of the API should consume.
4. `roles.rs` maps Keycloak realm/client roles to MBAM baseline roles and additive permission clauses.
5. `session.rs` describes secure browser/device session binding expectations.
6. `mod.rs` exposes the public module boundary.

## Target authentication flow

1. User authenticates with Keycloak.
2. Frontend receives an authorization-code flow result and exchanges through the configured auth path.
3. API validates the JWT using the Keycloak issuer and JWKS.
4. API extracts normalized identity claims.
5. API maps Keycloak roles to a baseline MBAM role:
   - `cashier`
   - `shop_manager`
   - `business_admin`
   - `master_owner`
6. API applies additive custom permissions only after the baseline is known.
7. API returns dashboard profiles and allowed API scopes from the service layer.
8. UI renders only the API-provided profile/routes/actions.

## Baseline role rule

Every user must have exactly one baseline role. Custom roles are not standalone identities. They are additive open clauses on top of a baseline.

Example:

```text
baseline: cashier
custom additions: product.view, product.create, shop.dashboard.view
result: cashier personal dashboard + assigned-shop product access
```

If custom role loading fails, the API must return the baseline role only. If baseline role loading fails, access must be denied.

## Token validation requirements

A Keycloak token is valid only when all of these checks pass:

- issuer equals the configured Keycloak realm issuer
- audience contains the configured API/client audience
- expiration and not-before times are valid
- signature verifies against the realm JWKS
- subject exists
- required baseline role can be derived

## Role mapping source

Preferred Keycloak setup:

- Realm roles for coarse identities:
  - `mbam_cashier`
  - `mbam_shop_manager`
  - `mbam_business_admin`
  - `mbam_master_owner`
- Client roles or groups for additive permissions:
  - `product.view`
  - `product.create`
  - `transaction.create`
  - `report.view`
  - `team.manage`

The API should not trust frontend role names. It should trust only the validated token plus database-backed scope assignments.

## Device and offline-session security

Keycloak validates identity; MBAM still owns offline business safety. Offline mode should use:

- encrypted local authorization snapshot
- device-bound offline grants
- server revalidation during sync
- least-privilege dashboard restoration
- no long-lived online bearer token stored for offline replay

## Migration strategy

1. Add this layer while leaving the existing auth module intact.
2. Implement Keycloak JWT verification behind `AuthProvider`.
3. Add configuration for Keycloak issuer, client id, audience, and JWKS URL.
4. Replace direct custom-auth validation with `AuthProvider::authenticate_bearer_token`.
5. Replace custom login/signup endpoints with Keycloak redirect/code-exchange integration.
6. Keep MBAM database memberships for business and unit scope only.
7. Remove local password auth after Keycloak flow is stable.

## Failure behavior

This layer must fail closed:

- invalid token -> unauthenticated
- missing baseline role -> forbidden
- missing custom permissions -> baseline only
- stale offline grant -> locked/offline unavailable
- unknown role -> no dashboard/profile

## Local development note

During transition, development seeds can continue to exist, but they should be treated as fixture data only. The end-state test users should be created in Keycloak and mapped to MBAM memberships by subject (`sub`) or federated identity id.
