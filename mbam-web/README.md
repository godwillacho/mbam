# mbam-web

React PWA frontend for Mbam — offline-first financial record-keeping for small businesses in CEMAC and Africa.

Built with **React** · **TypeScript** · **Vite** · **PWA (offline-first)**

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | CSS Modules |
| PWA | vite-plugin-pwa (IndexedDB offline sync) |
| Auth | JWT + SSO (Google, Microsoft) |
| Language | English / French toggle |

## Getting started

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`

## Structure

```
src/
  pages/
    auth/         # Login & signup screens
  components/
    auth/         # AuthLayout, LoginForm, SignupForm, SSOButtons
  hooks/          # useAuth, useOfflineSync
  lib/            # API client, IndexedDB helpers
  types/          # Shared TypeScript types
```

## Offline-first

The app caches itself on first load and stores transactions locally in IndexedDB. Data syncs to the backend whenever a connection is available — users never lose a sale due to poor connectivity.

## Project

Part of the **Mbam** platform — [mbam-api](https://github.com/YOUR_USERNAME/mbam-api) is the Rust backend.
