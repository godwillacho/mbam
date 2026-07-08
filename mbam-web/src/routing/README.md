# Routing

This folder is the single place to look for "what pages exist and how are they
gated" in the frontend.

## Files

- `AppRoutes.tsx` — the full `<Routes>` tree (composition root). `App.tsx`
  only mounts `<BrowserRouter>` around this component.
- `ProtectedRoute.tsx` — wraps a route element and redirects to `/dashboard`
  when the current member can't access the given `routeKey`.
- `accessControl.ts` — `AppRouteKey` union, the route-key -> permission map,
  `canAccessRoute`, and the scope helpers (`getScopedUnits`,
  `getScopedTransactions`, `getScopedPendingPayments`, `canManageProducts`)
  used throughout the app for client-side display/navigation gating.

Client-side checks here are usability controls, not authority — the backend
(`mbam-api/src/routes/`, `modules/*/routes.rs`) is the real enforcement
boundary. See `REPOSITORY_MAP.md`'s "Security boundaries" section.
