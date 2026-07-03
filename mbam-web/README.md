# mbam-web

React PWA frontend for Mbam — offline-first financial record-keeping for small businesses in CEMAC and Africa.

Built with **React** · **TypeScript** · **Vite** · **PWA (offline-first)**

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Plain CSS (one stylesheet per component/page) |
| PWA | vite-plugin-pwa (encrypted IndexedDB offline sync) |
| Auth | Keycloak (hosted sign-in, token introspection); a legacy email/password + OAuth path also exists in the API for non-Keycloak deployments |
| Charts | Recharts |
| Language | English / French toggle (react-i18next) |

## Getting started

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`

See `mbam-api/README_MAC_DEBUG.md` and `mbam-api/DEVELOPMENT_TEST_ACCOUNTS.md`
for running the backend and signing in with seeded dev accounts.

Frontend console logging, offline log buffering, redaction, and optional Sentry
reporting are documented in
[`../docs/observability.md`](../docs/observability.md).

## Structure

```
src/
  pages/          # Route-level screens (auth/, dashboard/, business/, products/, team/, transactions/, reports/)
  components/     # Reusable UI (app/ shell + route protection, auth/ layout, charts/, csv/)
  services/       # HTTP client, auth/session, encryption, offline sync, logging
  security/       # Client-side navigation/display authorization (accessControl.ts)
  types/          # Shared TypeScript contracts (auth, offline, workspace)
  i18n/           # Translation resource bundles (EN/FR)
  data/           # Development/offline fallback data (never an authorization source)
  utils/          # Formatting and CSV parsing helpers
```

See `../REPOSITORY_MAP.md` for the authoritative, actively-maintained module map.

## Offline-first

The app caches itself on first load and stores transactions locally in encrypted IndexedDB. Data syncs to the backend whenever a connection is available — users never lose a sale due to poor connectivity.

## Project

Part of the **Mbam** platform — [mbam-api](https://github.com/godwillacho/mbam/tree/main/mbam-api) is the Rust backend, in the same repository.
