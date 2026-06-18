# Mbam Authentication Layer

This directory is the single API boundary for identity-provider authentication.
It replaces route-level JWT parsing and provides a controlled migration from
Mbam-issued tokens to Keycloak-issued OpenID Connect access tokens.

## Current Status

The API resource-server boundary and normalized authorization context are
implemented. Protected domain routes extract `AuthorizationContext`; route
handlers no longer parse bearer tokens or resolve users independently.

`GET /api/v1/me/authorization` is the sole online frontend authorization
bootstrap. It returns only the current identity, one validated baseline role,
effective and custom permissions, active membership IDs, authorized businesses
and units, dashboard type, authorized routes, and authorization version.

Legacy browser login and local role-editing screens remain only for staged
migration compatibility. Do not enable Keycloak mode in production until
browser PKCE login and the Keycloak role-management outbox are completed and
tested.

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

A Keycloak role never creates Mbam business access by itself. A protected
request succeeds only when the token is valid, the subject maps to an active
local user, at least one active local membership exists, all active memberships
reduce to one baseline role, and Keycloak asserts exactly that baseline.

Permissions remain attached to individual membership grants. The context keeps
top-level union sets for display, but scope-aware guards require permission and
resource scope to occur on the same membership. This prevents a permission from
one business being combined with scope from another business.

## Directory Layout

- `mod.rs`: provider selection and the public authentication API.
- `keycloak.rs`: confidential-client token introspection and claim extraction.
- `principal.rs`: identity-only extraction for pre-membership flows and bearer parsing.
- `context.rs`: normalized authorization context and reusable fail-closed guards.
- `repository.rs`: subject mapping plus active membership-grant loading.

The authorization bootstrap route lives in `src/modules/authorization/` so
identity validation stays separate from response presentation.

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

Custom Keycloak roles may be composite roles but must include exactly one
baseline role. Mbam custom permissions are still loaded from the local
membership role and are never inferred from arbitrary Keycloak role names. Do
not make one baseline role composite with another.

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
5. Active memberships are loaded as separate permission-and-scope grants.
6. All local memberships must resolve to one baseline role.
7. Keycloak must assert exactly the same baseline role.
8. The request receives a normalized `AuthorizationContext`.
9. Route guards and domain services apply permission, business, unit, ownership,
   and employee-management checks.

Any missing token, inactive token, audience mismatch, unknown identity, inactive
or absent membership, unknown local role, multiple conflicting baselines, or
Keycloak/Mbam role mismatch returns `401 Unauthorized` without falling back to
a broader role or the legacy validator.

Recognized identities lacking a required feature receive `403 Forbidden`.
Resource-scoped guards use `404 Not Found` when confirming existence would leak
another tenant's business, unit, employee, or transaction.

## Authorization Context

The context contains:

- local user ID and optional Keycloak subject during legacy migration;
- full name and email for the current-user bootstrap only;
- one validated baseline role;
- effective permissions;
- active membership IDs;
- authorized business-account, business, and unit IDs;
- durable authorization version;
- private membership-scoped grants used by guards.

Reusable guards cover baseline roles, permissions, business scope, unit scope,
transaction ownership, and employee-management ceilings. Domain repositories
still filter by membership, permission, and scope; route guards are defense in
depth, not the sole authorization layer.

## Authorization Versioning

Migration `0010_authorization_versions.sql` adds a monotonic user
`authorization_version`. Database triggers increment it when memberships,
membership scopes, business/unit status, role permissions, permission codes, or
role baseline definitions change. Online authorization is fetched without a
cross-session client cache, and offline snapshots must compare this version and
discard stale state during synchronization.

The version is not a bearer credential and does not replace token revocation.

## Migration Plan

### Phase 1: API Resource Server

- Centralize all protected-route authentication in this directory. Completed.
- Normalize membership-scoped authorization and remove route bearer parsing. Completed.
- Add the current-user authorization bootstrap. Completed.
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

Until this phase is complete, Mbam membership writes remain authoritative for
domain scope, local role edits are migration-only, and any Keycloak/Mbam
baseline mismatch fails visibly with `401`. No request silently repairs a
mismatch or performs an unsafe direct dual write.

### Phase 4: Legacy Removal

- Disable `AUTH_PROVIDER=legacy`.
- Remove Mbam password hashes, refresh-token issuance, password reset, and OAuth
  broker code after all users have migrated.
- Retain offline grants only if their signing and revocation model remains
  independent from Keycloak sessions.

## Operational Notes

Token introspection is intentionally used for the first migration phase.
Keycloak validates token signature, issuer ownership, expiry, session state,
and revocation before returning `active=true`; Mbam separately requires the
configured API audience, stable subject, and one matching baseline role.
Requests have an eight-second upper bound. Keycloak unavailability, timeout,
malformed responses, missing claims, and inactive tokens all fail closed.

A later optimization may use explicit issuer/audience JWT verification with
cached JWKS plus a bounded revocation window.

Never log access tokens, refresh tokens, client secrets, authorization headers,
or complete introspection responses.

## Validation Scenarios

- Valid token, linked user, one matching baseline, active grants: allowed.
- Valid token with wrong audience: denied.
- Valid token with no baseline role: denied.
- Token with multiple baseline roles: denied.
- Local memberships with conflicting baseline roles: denied.
- Cashier token with shop-manager local membership: denied.
- Missing or disabled local membership with valid Keycloak session: denied.
- Disabled Keycloak user with active local membership: denied by introspection.
- Unknown Keycloak subject with email linking disabled: denied.
- Unknown subject with verified matching email during controlled linking: linked.
- Unknown subject with unverified email: denied.
- Unknown local role without a recognized baseline: denied.
- Permission from one membership plus scope from another: denied.
- Shop manager assigning any role above cashier: denied.
- Cashier opening employee management: denied.
- Network failure or Keycloak timeout: denied; never fall back to legacy.

## Official References

- https://www.keycloak.org/securing-apps/oidc-layers
- https://www.keycloak.org/docs/latest/server_admin/index.html
- https://www.keycloak.org/docs-api/latest/rest-api/index.html
