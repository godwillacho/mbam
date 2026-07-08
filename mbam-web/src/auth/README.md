# Auth

This folder is the single place to look for "where is authentication code" in
the frontend.

- `pages/auth/` -- login/signup redirect page, access bootstrap, invite
  acceptance, password reset. Already its own folder before this reorg.
- `components/auth/` -- shared auth layout/forms. Already its own folder
  before this reorg.
- This folder (`auth/`) -- the service layer, which used to be scattered
  across `services/` mixed in with every other domain service. As of the
  2026-07-08 reorg the files themselves physically live here (not just a
  re-export facade):
  - `authService.ts` -- cloud session lifecycle: login/signup, offline-access
    enrollment, password reset, OAuth provider sign-in.
  - `authSessionStore.ts` -- in-memory active session store (current access
    token, hydration on boot).
  - `authSessionPersistence.ts` -- encrypted persistence of the active session
    across reloads.
  - `authorizationService.ts` -- the `/api/v1/me/authorization` bootstrap
    adapter and its response shape.
  - `keycloakService.ts` -- Keycloak-hosted login/logout/token-refresh (the
    supported runtime auth provider -- see `mbam-api/src/auth/README.md` for
    the backend side).
  - `deviceBindingService.ts` -- per-browser device identity used to bind
    offline grants to one device.
  - `offlineVaultService.ts` -- encrypted-at-rest offline vault (unlock/lock,
    data key access).
  - `offlineSessionService.ts` -- signed offline authorization grants
    (separate from the offline vault).
  - `offlineAuthorizationSnapshotService.ts` -- cached authorization snapshot
    used to validate offline access without a network round-trip.
  - `index.ts` -- a genuine local barrel re-exporting the above from one
    surface (`from "../auth"` / `from "./auth"`).

These nine files still import a handful of general-purpose services that
stayed in `services/` (`apiClient.ts`, `teamService.ts`, `encryptionService.ts`,
`offlineDatabase.ts`) since those aren't auth-specific. Every other file in the
app that used to import these nine from `services/...` was updated to import
from `auth/...` instead.

See `mbam-api/src/auth/README.md` for the backend-side equivalent and the full
Keycloak design this frontend layer talks to.
