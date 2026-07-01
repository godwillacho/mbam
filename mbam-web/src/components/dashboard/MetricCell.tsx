import { Link } from "react-router-dom";
import AuthorizedLineChart from "../charts/AuthorizedLineChart";
import type { AppRouteKey } from "../../security/accessControl";
import type { DashboardLeader, DashboardSummary } from "../../services/reportService";
import { formatMoney } from "../../utils/formatters";

export type MetricKey = keyof DashboardSummary;

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  fallbackPath: string;
  routeKey: AppRouteKey;
  quantity?: boolean;
}

export interface MetricCellProps {
  definition: MetricDefinition;
  leader?: DashboardLeader;
  currency: string;
}

// Presentational dashboard metric card. Kept as a standalone component (no
// data fetching, no auth checks) so it can be registered as a Plasmic code
// component and visually rearranged/restyled in Plasmic Studio without
// touching the authorization or data-loading logic in BaselineDashboards.tsx.
export default function MetricCell({ definition, leader, currency }: MetricCellProps) {
  const path = leader?.detail_path ?? definition.fallbackPath;
  const value = leader
    ? definition.quantity
      ? `${leader.primary_value.toLocaleString()} sold`
      : formatMoney(leader.primary_value, currency)
    : "No sales yet";

  return (
    <Link
      aria-label={`${definition.label}: ${leader?.entity_name ?? "no data"}`}
      className="metric-card dashboard-metric-link"
      to={path}
    >
      <span>{definition.label}</span>
      <strong>{leader?.entity_name ?? "No authorized activity"}</strong>
      <small>{value}</small>
      <AuthorizedLineChart
        compact
        label={definition.label}
        points={leader?.points ?? []}
        quantity={definition.quantity}
      />
    </Link>
  );
}
