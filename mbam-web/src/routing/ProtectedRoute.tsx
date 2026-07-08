import { Navigate } from "react-router-dom";
import { canAccessRoute, getCurrentMember, type AppRouteKey } from "./accessControl";

interface ProtectedRouteProps {
  routeKey: AppRouteKey;
  /**
   * Lets a single route unlock on either of two independent permissions.
   * Used by "/stock" now that StockPage.tsx also hosts product-catalog
   * management merged in from the old standalone Products-manage page: a
   * member with only `screen.products` (e.g. the baseline cashier role,
   * which has never had stock-screen access) must still be able to reach
   * this route to manage products, exactly as they could at the old
   * `/products/manage` path. See StockPage.tsx's canViewProductsSection
   * comment for how the page itself gates which section renders per
   * permission.
   */
  altRouteKey?: AppRouteKey;
  children: JSX.Element;
}

export default function ProtectedRoute({ routeKey, altRouteKey, children }: ProtectedRouteProps) {
  const member = getCurrentMember();

  if (!canAccessRoute(member, routeKey) && !(altRouteKey && canAccessRoute(member, altRouteKey))) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
