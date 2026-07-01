# Plasmic visual editing integration

Mbam optionally integrates [Plasmic](https://www.plasmic.app/) so presentational
dashboard components can be visually rearranged and restyled in Plasmic Studio
without touching authorization or data-loading logic.

The integration is off by default and fully optional. Every Plasmic-aware
component falls back to its normal hardcoded layout when no Plasmic project is
configured, so the app behaves identically to before this integration existed
until you deliberately wire in a real project.

## What Plasmic controls, and what it never controls

Plasmic only ever controls the **arrangement and styling** of registered
"code components" — the actual React components already in this codebase,
unmodified. It never controls:

- Which data a user is authorized to see (`security/accessControl.ts`,
  `canAccessRoute`, `canViewDashboardMetric`)
- What data is fetched, or from where (`services/reportService.ts` and friends)
- Business logic, validation, or anything touching the API

Data flows one direction only: the real page component (e.g.
`BaselineDashboards.tsx`) loads authorized data as it always has, then passes
it as props into a Plasmic-rendered layout. Plasmic never fetches or decides
data on its own.

## Setup

1. Create a free account at [plasmic.app](https://www.plasmic.app/) and a new
   project (the free Starter plan covers this — see the tool's own pricing
   page for current limits).
2. In the project, open **Settings > Code** and copy the **Project ID** and
   the **public API token** (not a secret key — Plasmic's loader tokens are
   meant to ship in the browser bundle, the same trust model as
   `VITE_SENTRY_DSN`).
3. Add them to `mbam-web/.env.development` (or `.env.production` for a
   deployed environment that should also use Plasmic):

   ```dotenv
   VITE_PLASMIC_PROJECT_ID=your-project-id
   VITE_PLASMIC_PROJECT_TOKEN=your-public-token
   ```

4. Restart `npm run dev` — Vite only reads `.env*` files at startup.

Until step 3 is done, `isPlasmicConfigured()` in `src/plasmic-init.ts` returns
`false` and nothing about the running app changes.

## Registered code components

| Plasmic component name | Source | Registered in |
| --- | --- | --- |
| `MbamMetricCell` | `components/dashboard/MetricCell.tsx` | `src/plasmic-init.ts` |

To register another existing component, import it into `plasmic-init.ts` and
call `PLASMIC.registerComponent(Component, { name, displayName, props })`
inside the `if (PLASMIC) { ... }` block. Keep registered components
presentational — no data fetching, no auth checks — the same way
`MetricCell.tsx` is written, so Plasmic Studio only ever changes layout and
styling.

## Rendering a Plasmic-authored layout

`components/dashboard/DashboardMetricsGrid.tsx` is the reference pattern for
wiring a Plasmic layout into a real page:

1. It checks `isPlasmicConfigured()`. If false, it renders the original
   hardcoded grid and stops.
2. If configured, it calls `PLASMIC.maybeFetchComponentData(name)` to check
   whether a component with that name actually exists in the connected
   Plasmic project yet (it won't, until you build one in Studio).
3. Only once that lookup succeeds does it render `<PlasmicComponent
   component={name} componentProps={...} />` inside a `<PlasmicRootProvider
   loader={PLASMIC}>`. Until then, it keeps rendering the hardcoded fallback.

This means adding the integration to a new part of the UI is safe to ship
before the matching Plasmic component exists — nothing user-visible changes
until you've actually authored `MbamDashboardMetricsGrid` (or whichever name
you choose) in Plasmic Studio using the registered `MbamMetricCell` building
block.

## Security and data notes

- Do not register components that render raw customer, transaction, or
  authorization data directly inside Plasmic-controlled slots without
  thinking through what a Studio editor could expose — keep registered
  components scoped to already-authorized, already-scoped data passed in as
  props, per `docs/security-rules.md`.
- The Plasmic public token is not a secret and does not need `.env.example`
  redaction, but it should still not be committed with a real value — leave
  `.env.example` and `.env.development` empty and let each developer/
  environment supply their own.
