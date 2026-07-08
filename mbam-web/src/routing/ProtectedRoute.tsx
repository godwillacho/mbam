import { Navigate } from "react-router-dom";
import { canAccessRoute, getCurrentMember, type AppRouteKey } from "./accessControl";

interface ProtectedRouteProps {
  routeKey: AppRouteKey;
  children: JSX.Element;
}

export default function ProtectedRoute({ routeKey, children }: ProtectedRouteProps) {
  const member = getCurrentMember();

  if (!canAccessRoute(member, routeKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
