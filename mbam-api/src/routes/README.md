# Routes

This folder is the API's router composition root, plus any top-level routes
that do not belong to a specific domain module.

## Files

- `mod.rs` exposes `router()` (top-level routes, e.g. health) and
  `app_router(state)` — the full application router. `app_router` builds the
  CORS layer, tracing layer, and every domain `.nest(...)` (auth,
  authorization, businesses, products, reports, stock, team members,
  keycloak-sync, invites, sync, transactions), then applies shared state.
  `main.rs` calls `routes::app_router(state)` directly; it no longer builds
  the router itself.
- `health.rs` exposes the health check endpoint used by local development,
  monitoring, and deployment checks.

Domain route handlers themselves still live in each `modules/<domain>/routes.rs`
— this folder only assembles them into one `Router`. See `src/auth/README.md`
for where the authentication-related modules live.
