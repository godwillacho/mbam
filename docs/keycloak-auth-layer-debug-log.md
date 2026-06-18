# Keycloak Auth Layer Debug Log

Date: 2026-06-18

Change summary: added a new API authentication layer directory for a planned Keycloak migration.

Added files:

- mbam-api/src/auth_layer/README.md
- mbam-api/src/auth_layer/mod.rs
- mbam-api/src/auth_layer/claims.rs
- mbam-api/src/auth_layer/provider.rs
- mbam-api/src/auth_layer/roles.rs
- mbam-api/src/auth_layer/keycloak.rs
- mbam-api/src/auth_layer/session.rs
- mbam-api/src/auth_layer/deny.rs
- mbam-api/src/auth_layer/authorization.rs

Expected behavior: current auth is not switched yet. The new files define the planned boundary for Keycloak identity, baseline role mapping, custom permission clauses, client session context, and fail-closed access handling.

Risk: the layer is scaffolded and not wired into startup or middleware yet.

Verification: GitHub file creation succeeded. Cargo check was not run because this environment does not provide Rust tooling.
