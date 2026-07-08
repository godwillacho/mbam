/**
 * Single entry point for "where does authentication code live" in this
 * frontend. `pages/auth/` and `components/auth/` are already their own
 * dedicated folders; the part that was scattered was the service layer, so
 * this barrel re-exports the auth-related services under one importable
 * surface (`from "../auth"` / `from "./auth"`) without moving the files
 * themselves -- every existing `from ".../services/xyzAuthThing"` import
 * elsewhere in the app keeps working unchanged. See README.md in this
 * folder for the full breakdown.
 */

// Cloud session lifecycle: login/signup, offline-access enrollment, password
// reset, OAuth provider sign-in.
export * from "../services/authService";

// In-memory active session store (current access token, hydration on boot).
export * from "../services/authSessionStore";

// Encrypted persistence of the active session across reloads.
export * from "../services/authSessionPersistence";

// The `/api/v1/me/authorization` bootstrap adapter and its response shape.
export * from "../services/authorizationService";

// Keycloak-hosted login/logout/token-refresh (the supported runtime auth
// provider -- see mbam-api/src/authentication/README.md for the backend side).
export * from "../services/keycloakService";

// Per-browser device identity used to bind offline grants to one device.
export * from "../services/deviceBindingService";

// Encrypted-at-rest offline vault (unlock/lock, data key access).
export * from "../services/offlineVaultService";

// Signed offline authorization grants (separate from the offline vault).
export * from "../services/offlineSessionService";

// Cached authorization snapshot used to validate offline access without a
// network round-trip.
export * from "../services/offlineAuthorizationSnapshotService";
