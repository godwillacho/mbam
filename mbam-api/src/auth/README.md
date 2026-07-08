# Auth

This folder is the single place to look for "where is authentication code" in
this backend. It is a thin facade, not a new implementation -- the real code
stays in the three places it already lived in, each of which has its own more
detailed README:

- `crate::authentication` (`src/authentication/`) -- the actual identity-
  provider boundary: Keycloak token introspection, the `AuthorizationContext`
  extractor every protected route pulls in, and `AuthenticationLayer` (chooses
  the legacy-JWT vs Keycloak provider at startup). See
  `src/authentication/README.md` for the full design, migration phases, and
  validation scenarios -- it is extensive and deliberately not duplicated here.
- `crate::security` (`src/security/`) -- Argon2 password hashing
  (`password.rs`) and access/refresh/offline-grant token issuance
  (`tokens.rs`).
- `crate::modules::auth` (`src/modules/auth/`) -- the HTTP handlers/service/
  repository for signup, login, refresh, logout, OAuth, password reset, and
  offline grants. This is the *legacy* (non-Keycloak) provider path, only
  mounted at `/api/v1/auth` when `AUTH_PROVIDER=legacy` (see
  `routes::app_router` in `src/routes/mod.rs`).

`mod.rs` re-exports all three under `crate::auth::...` (`crate::auth::handlers`
for the modules::auth pieces, `crate::auth::tokens_and_passwords` for the
security pieces, everything else directly). Existing `use crate::authentication::...`/
`use crate::modules::auth::...`/`use crate::security::...` call sites elsewhere
in the codebase were left unchanged -- this facade is additive, not a
replacement for those paths.
