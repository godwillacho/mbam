# Auth

This folder is the single place to look for "where is authentication code" in
the frontend. It is a thin facade (`index.ts`), not a new implementation --
the real files stay exactly where they were:

- `pages/auth/` -- login/signup redirect page, access bootstrap, invite
  acceptance, password reset. Already its own folder before this reorg.
- `components/auth/` -- shared auth layout/forms. Already its own folder
  before this reorg.
- `services/authService.ts`, `authSessionStore.ts`, `authSessionPersistence.ts`,
  `authorizationService.ts`, `keycloakService.ts`, `deviceBindingService.ts`,
  `offlineVaultService.ts`, `offlineSessionService.ts`,
  `offlineAuthorizationSnapshotService.ts` -- these were the scattered part
  (mixed in with every other domain service in `services/`). `index.ts` here
  re-exports all of them under one surface, `from "../auth"`, without moving
  the files -- existing `from "../services/xyz"` imports elsewhere in the app
  were intentionally left unchanged.

See `mbam-api/src/auth/README.md` for the backend-side equivalent, and
`mbam-api/src/authentication/README.md` for the full Keycloak design this
frontend layer talks to.
