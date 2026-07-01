import { useEffect, useState } from "react";
import { PlasmicComponent, PlasmicRootProvider } from "@plasmicapp/loader-react";
import {
  isPlasmicConfigured,
  PLASMIC,
  PLASMIC_DASHBOARD_METRICS_GRID_COMPONENT,
} from "../../plasmic-init";
import MetricCell, { type MetricDefinition } from "./MetricCell";
import type { DashboardSummary } from "../../services/reportService";

export interface DashboardMetricsGridProps {
  definitions: MetricDefinition[];
  summary: DashboardSummary | null;
  currency: string;
}

// The original hardcoded layout. This is always what renders when Plasmic
// is not configured, and is also the fallback while a Plasmic-authored
// layout is loading (or if Studio has no "MbamDashboardMetricsGrid"
// component yet) so the dashboard never breaks or blanks out for lack of a
// Plasmic project.
function HardcodedMetricsGrid({ definitions, summary, currency }: DashboardMetricsGridProps) {
  return (
    <div className="metrics-grid dashboard-leader-grid">
      {definitions.map((definition) => (
        <MetricCell
          currency={currency}
          definition={definition}
          key={definition.key}
          leader={summary?.[definition.key]}
        />
      ))}
    </div>
  );
}

// Renders the dashboard metric cards from a Plasmic-authored layout when a
// Plasmic project is configured and has published (or, in development,
// drafted) a "MbamDashboardMetricsGrid" component. Real authorized data
// keeps flowing from BaselineDashboards.tsx through componentProps — Plasmic
// only ever controls arrangement and styling of the registered MetricCell
// building block, never which data is authorized to load.
export default function DashboardMetricsGrid(props: DashboardMetricsGridProps) {
  const [plasmicComponentAvailable, setPlasmicComponentAvailable] = useState(false);

  useEffect(() => {
    if (!PLASMIC) return;
    let ignore = false;
    PLASMIC.maybeFetchComponentData(PLASMIC_DASHBOARD_METRICS_GRID_COMPONENT)
      .then((data) => {
        if (!ignore) setPlasmicComponentAvailable(Boolean(data));
      })
      .catch(() => {
        if (!ignore) setPlasmicComponentAvailable(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (!isPlasmicConfigured() || !PLASMIC || !plasmicComponentAvailable) {
    return <HardcodedMetricsGrid {...props} />;
  }

  return (
    <PlasmicRootProvider loader={PLASMIC}>
      <PlasmicComponent
        component={PLASMIC_DASHBOARD_METRICS_GRID_COMPONENT}
        componentProps={props}
      />
    </PlasmicRootProvider>
  );
}
