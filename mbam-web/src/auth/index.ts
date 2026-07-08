/**
 * Single entry point for "where does authentication code live" in this
 * frontend. `pages/auth/` and `components/auth/` are already their own
 * dedicated folders; this barrel covers the service layer, which used to be
 * scattered across `services/` under a thin re-export facade. As of the
 * 2026-07-08 reorg the files themselves live in this folder too, so this is
 * now a genuine local barrel, not a facade pointing elsewhere. See README.md
 * in this folder for the full breakdown.
 */

// Cloud session lifecycle: login/signup, offline-access enrollment, password
// reset, OAuth provider sign-in.
export * from "./authService";

// In-memory active session store (current access token, hydration on boot).
export * from "./authSessionStore";

// Encrypted persistence of the active session across reloads.
export * from "./authSessionPersistence";

// The `/api/v1/me/authorization` bootstrap adapter and its response shape.
export * from "./authorizationService";

// Keycloak-hosted login/logout/token-refresh (the supported runtime auth
// provider -- see mbam-api/src/auth/README.md for the backend side).
export * from "./keycloakService";

// Per-browser device identity used to bind offline grants to one device.
export * from "./deviceBindingService";

// Encrypted-at-rest offline vault (unlock/lock, data key access).
export * from "./offlineVaultService";

// Signed offline authorization grants (separate from the offline vault).
export * from "./offlineSessionService";

// Cached authorization snapshot used to validate offline access without a
// network round-trip.
export * from "./offlineAuthorizationSnapshotService";
