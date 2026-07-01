import { initPlasmicLoader, type PlasmicComponentLoader } from "@plasmicapp/loader-react";
import MetricCell from "./components/dashboard/MetricCell";

// Plasmic project credentials. Public loader tokens are safe to ship in the
// browser bundle (same trust model as VITE_SENTRY_DSN) but must never be
// confused with a Plasmic *API secret*, which is never used from the browser.
// Leave both empty to disable the integration entirely: every call site in
// this app falls back to its existing hardcoded layout when Plasmic is not
// configured, so the app behaves exactly as before until a real project is
// wired in.
const projectId = import.meta.env.VITE_PLASMIC_PROJECT_ID;
const projectToken = import.meta.env.VITE_PLASMIC_PROJECT_TOKEN;

// Names used to look up Plasmic-authored components. These must match the
// component names created in Plasmic Studio exactly.
export const PLASMIC_METRIC_CELL_COMPONENT = "MbamMetricCell";
export const PLASMIC_DASHBOARD_METRICS_GRID_COMPONENT = "MbamDashboardMetricsGrid";

export function isPlasmicConfigured(): boolean {
  return Boolean(projectId && projectToken);
}

export const PLASMIC: PlasmicComponentLoader | null = isPlasmicConfigured()
  ? initPlasmicLoader({
      projects: [{ id: projectId, token: projectToken }],
      // Fetch unpublished (in-progress) content in local development so
      // changes made in Plasmic Studio show up without publishing first.
      // Production builds should only ever render published content.
      preview: import.meta.env.DEV,
    })
  : null;

if (PLASMIC) {
  // Registering MetricCell makes the existing dashboard card available as a
  // draggable building block inside Plasmic Studio. It intentionally keeps
  // the same props the real component already uses (definition/leader/
  // currency) so Studio-authored layouts can be rendered with the same real
  // authorized data BaselineDashboards.tsx already loads — Plasmic controls
  // arrangement and styling only, never authorization or data fetching.
  PLASMIC.registerComponent(MetricCell, {
    name: PLASMIC_METRIC_CELL_COMPONENT,
    displayName: "Mbam Metric Cell",
    props: {
      definition: "object",
      leader: "object",
      currency: "string",
    },
  });
}
