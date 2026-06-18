# Keycloak Authentication Layer

This directory is the migration boundary for replacing Mbam's local password/JWT role system with Keycloak-managed authentication and role assignment.

The current app has had repeated reliability problems because the frontend and backend both inferred roles from local state, seeded users, mock workspace data, and custom role conventions. Keycloak should become the single identity provider, while Mbam remains the authorization and data-scope enforcement API.

## Goal

Use Keycloak for:

- User authentication
- Identity lifecycle
- Baseline role assignment
- Custom additive role flags
- Token issuing and refresh flows
- Single sign-on integration later

Use Mbam API for:

- Business account membership records
- Business and business-unit scope checks
- Product, transaction, employee, and report authorization
- Offline authorization snapshots
- Offline sync conflict validation
- Audit logging

Keycloak proves who the user is and which role claims they carry. Mbam still verifies what business, shop, products, transactions, and employees that user may access.

## Required Keycloak Realm Model

Create a realm for Mbam, for example:

```text
mbam-local
```

Create a frontend/API client, for example:

```text
mbam-web
```

Recommended roles:

```text
mbam_master_owner
mbam_business_admin
mbam_shop_manager
mbam_cashier
mbam_open_reports
mbam_open_team
mbam_open_business_structure
```

The first four roles are baseline roles. A user must have one baseline role before they can receive any custom open clauses. The last three are additive roles and must never grant access by themselves.

## Baseline Role Contract

| Keycloak role | Mbam baseline | Default dashboard |
|---|---|---|
| `mbam_master_owner` | master owner | `/dashboard?view=master` |
| `mbam_business_admin` | business admin | `/dashboard?view=business` |
| `mbam_shop_manager` | shop manager | `/dashboard?view=shop` |
| `mbam_cashier` | cashier | `/dashboard?view=personal` |

A custom role is represented by baseline role plus additive roles. Example:

```text
mbam_cashier
mbam_open_reports
```

This remains a cashier baseline. It can open a reports menu only if the API also validates the user's shop or business scope.

## Fail-Closed Rules

1. Unknown Keycloak roles do not create dashboards.
2. Additive roles without a baseline role do not create dashboards.
3. Frontend route visibility is not authoritative.
4. Every API action must validate both permission and business/unit scope.
5. Offline snapshots must be generated only after online Keycloak token validation and Mbam scope validation.
6. If Keycloak verification fails, the API must return `401` or `403`, not a fallback role.

## Function Map

`keycloak.rs` defines the first migration surface:

- `extract_bearer_token` parses the Authorization header in one place.
- `verify_keycloak_access_token` is the future live token verifier. It currently fails closed until the Keycloak issuer, audience, and JWKS settings are configured.
- `principal_from_verified_claims` maps already-verified Keycloak claims into the internal principal object.
- `collect_realm_roles` reads Keycloak realm roles.
- `baseline_from_roles` selects the baseline role using least privilege.
- `permissions_from_roles` applies baseline permissions and additive open clauses.
- `has_permission` answers whether the validated principal has a permission before a route performs business/unit scope validation.

Each function has comments in code explaining the intended use and security boundary.

## Migration Plan

### Phase 1: Add Layer Without Breaking Current Login

Current status. The directory exists, but live routes still use the current local JWT verifier. This avoids breaking local development before Keycloak is configured.

### Phase 2: Add Environment Configuration

Add these variables once the realm is ready:

```dotenv
KEYCLOAK_ISSUER=http://localhost:8081/realms/mbam-local
KEYCLOAK_AUDIENCE=mbam-web
KEYCLOAK_CLIENT_ID=mbam-web
KEYCLOAK_JWKS_URL=http://localhost:8081/realms/mbam-local/protocol/openid-connect/certs
```

### Phase 3: Verify Tokens With JWKS

Implement `verify_keycloak_access_token` using Keycloak's JWKS and enforce:

- Token signature
- `iss`
- `aud` or `azp`
- Expiry
- Not-before constraints, if configured

Do not decode or trust tokens without signature validation.

### Phase 4: Replace Route Guards

Replace local calls such as:

```rust
tokens::verify_access_token(token, &state.config.jwt_access_secret)
```

with the authentication layer. Each protected route should receive an `AuthenticatedPrincipal`, then perform data-scope checks against PostgreSQL.

### Phase 5: Move Frontend Login To Keycloak

The web app should redirect to Keycloak for login and store only the resulting access token/session metadata required by the API client. The dashboard picker should still rely on API-provided dashboard profiles, not on local role guesses.

### Phase 6: Remove Local Password Authentication

After Keycloak login is stable, retire local password signup/login routes or keep them behind a development-only feature flag.

## Security Notes

- Keycloak roles are not enough to access data. Mbam must still verify business account and business unit scope.
- Custom roles are additive and must remain anchored to baseline roles.
- Offline grants must be issued by Mbam only after Keycloak token validation and Mbam scope validation.
- Never log tokens, cookies, Authorization headers, Keycloak refresh tokens, or user profile PII.
