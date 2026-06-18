# Mbam Authentication Layer

This directory is the single API boundary for identity-provider authentication.
It replaces route-level JWT parsing and provides a controlled migration from
Mbam-issued tokens to Keycloak-issued OpenID Connect access tokens.

## Current Status

Phase 1 is implemented: every protected API route now uses this authentication
layer and can validate Keycloak access tokens when `AUTH_PROVIDER=keycloak`.
Legacy browser login and local role-editing screens still exist for migration
compatibility. Do not enable Keycloak mode in production until browser PKCE login
and Keycloak Admin API role synchronization are completed and tested.

## Ownership Model

Keycloak owns:

- User credentials and password policies
- Login, logout, session refresh, MFA, recovery, and email verification
- Google, Microsoft, and other identity-provider brokering
- Realm and client roles
- Account lockout and authentication events

Mbam owns:

- Business accounts, businesses, shops, and units
- Membership status and tenant scope
- Domain permissions used by services
- Transactions, products, reporting, and offline synchronization
- Offline authorization snapshots and their authorization version

A Keycloak role never creates Mbam business access by itself. A request succeeds
only when the token is valid and every baseline role represented by active local
memberships is present in the token. Extra Keycloak roles grant nothing without
an active Mbam membership.

## Directory Layout

- `mod.rs`: provider selection and the public authentication API.
- `keycloak.rs`: confidential-client token introspection and claim extraction.
- `principal.rs`: normalized authenticated principal and bearer parsing.
- `repository.rs`: Keycloak-subject mapping to active local users and roles.

Every function in this directory has a Rust documentation comment describing
its purpose and security behavior.

## Configuration

```bash
AUTH_PROVIDER=keycloak
KEYCLOAK_ISSUER_URL=http://localhost:8180/realms/mbam
KEYCLOAK_CLIENT_ID=mbam-api
KEYCLOAK_CLIENT_SECRET=replace_with_service_client_secret
KEYCLOAK_AUDIENCE=mbam-api
KEYCLOAK_ROLE_CLIENT_ID=mbam-api
KEYCLOAK_ALLOW_EMAIL_LINKING=false
```

`KEYCLOAK_ISSUER_URL` is the realm issuer, not the Keycloak server root.
`KEYCLOAK_CLIENT_ID` must be a confidential client permitted to call token
introspection. `KEYCLOAK_AUDIENCE` must be present in API access tokens.

Keep `KEYCLOAK_ALLOW_EMAIL_LINKING=false` in production. When enabled for a
controlled migration, Mbam links an unknown Keycloak subject to an existing
active local user only when Keycloak asserts a verified matching email. Disable
it after identities have been linked.

## Required Keycloak Roles

Create these realm roles or client roles under `KEYCLOAK_ROLE_CLIENT_ID`:

- `master_owner`
- `business_admin`
- `shop_manager`
- `cashier`

Custom roles should be composite roles that include exactly one baseline role.
For example, `senior_cashier` should include `cashier` plus separately reviewed
optional permissions. Do not make `cashier` composite with a broader role.

The API accepts roles from `realm_access.roles` and from
`resource_access[KEYCLOAK_ROLE_CLIENT_ID].roles`. Configure protocol mappers so
those claims and the API audience are available to introspection.

## Identity Provisioning

The stable Keycloak `sub` claim is stored in the existing `auth_identities`
table:

```sql
insert into auth_identities (
  user_id,
  provider,
  provider_user_id,
  provider_email
)
values (
  '<local-user-uuid>',
  'keycloak',
  '<keycloak-subject>',
  '<verified-email>'
);
```

Provision identities through an administrative migration or a future Keycloak
event listener. Do not use email as the permanent identity key because email can
change and may be reassigned.

## Request Flow

1. The browser obtains an access token from Keycloak using Authorization Code
   flow with PKCE.
2. The browser sends the token as `Authorization: Bearer <token>`.
3. `AuthenticationLayer` validates the token through Keycloak introspection.
4. The Keycloak `sub` is resolved to a local active user.
5. Keycloak baseline roles are compared with all active local membership roles.
6. Domain services apply business, unit, and object-level authorization.

Any missing token, inactive token, audience mismatch, unknown identity, inactive
membership, unknown local role, or role mismatch returns `401 Unauthorized`
without falling back to a broader role or the legacy validator.

## Migration Plan

### Phase 1: API Resource Server

- Centralize all protected-route authentication in this directory. Completed.
- Enable `AUTH_PROVIDER=keycloak` in a non-production environment.
- Provision Keycloak subjects for the existing test users.
- Validate baseline dashboards and cross-unit denial tests.

### Phase 2: Browser Login

- Replace email/password API calls with Keycloak Authorization Code + PKCE.
- Keep access tokens in memory and use Keycloak session refresh.
- Remove direct Google and Microsoft OAuth code from Mbam; configure those
  providers in Keycloak.

### Phase 3: Role Administration

- Replace direct local baseline-role mutation with Keycloak Admin API calls from
  a server-side service account.
- Use a transactional outbox rather than an unsafe Keycloak/database dual write.
- Treat local role rows as a synchronized projection used for domain permission
  queries and offline snapshots.
- Reject or quarantine synchronization mismatches.

### Phase 4: Legacy Removal

- Disable `AUTH_PROVIDER=legacy`.
- Remove Mbam password hashes, refresh-token issuance, password reset, and OAuth
  broker code after all users have migrated.
- Retain offline grants only if their signing and revocation model remains
  independent from Keycloak sessions.

## Operational Notes

Token introspection is intentionally used for the first migration phase because
it gives immediate session and role revocation semantics and avoids maintaining
a local signing-key cache. Requests have an eight-second upper bound. Keycloak
availability is therefore part of online API availability. A later optimization
may use issuer and audience-validated JWT verification with cached JWKS plus a
short revocation window.

Never log access tokens, refresh tokens, client secrets, authorization headers,
or complete introspection responses.

## Validation Scenarios

- Valid token, linked user, complete role coverage: allowed.
- Valid token with wrong audience: denied.
- Valid token with no baseline role: denied.
- Token missing one of multiple active local baseline roles: denied.
- Cashier token with shop-manager local membership: denied.
- Disabled local membership with valid Keycloak session: denied by domain access.
- Disabled Keycloak user with active local membership: denied by introspection.
- Unknown Keycloak subject with email linking disabled: denied.
- Unknown subject with verified matching email during controlled linking: linked.
- Unknown subject with unverified email: denied.
- Unknown local role without a recognized baseline: denied.
- Network failure or Keycloak timeout: denied; never fall back to legacy.

## Official References

- https://www.keycloak.org/securing-apps/oidc-layers
- https://www.keycloak.org/docs/latest/server_admin/index.html
- https://www.keycloak.org/docs-api/latest/rest-api/index.html
