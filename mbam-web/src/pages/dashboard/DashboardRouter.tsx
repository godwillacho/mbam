import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentMember } from "../../routing/accessControl";
import { normalizeDashboardView, type DashboardView } from "./dashboardPermissions";
import {
  baselineDashboardPath,
  baselineDashboardView,
  dashboardPathForView,
} from "./dashboardRoutes";

export function DashboardRouter() {
  const path = baselineDashboardPath(getCurrentMember());
  return <Navigate to={path ?? "/auth"} replace />;
}

interface BaselineDashboardRouteProps {
  view: Exclude<DashboardView, "custom">;
  children: ReactElement;
}

export function BaselineDashboardRoute({ view, children }: BaselineDashboardRouteProps) {
  const member = getCurrentMember();
  const baseline = baselineDashboardView(member);

  if (!baseline) return <Navigate to="/auth" replace />;
  if (normalizeDashboardView(view, member) !== view) {
    return <Navigate to={dashboardPathForView(baseline)} replace />;
  }
  return children;
}
