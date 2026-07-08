import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import AccessBootstrapPage from "../pages/auth/AccessBootstrapPage";
import AuthPage from "../pages/auth/AuthPage";
import InviteAcceptancePage from "../pages/auth/InviteAcceptancePage";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage";
import BusinessStructurePage from "../pages/business/BusinessStructurePage";
import {
  BusinessAdminDashboard,
  CashierDashboard,
  MasterOwnerDashboard,
  ShopManagerDashboard,
} from "../pages/dashboard/BaselineDashboards";
import DashboardMetricDetailPage from "../pages/dashboard/DashboardMetricDetailPage";
import { BaselineDashboardRoute, DashboardRouter } from "../pages/dashboard/DashboardRouter";
import PendingPaymentsPage from "../pages/dashboard/PendingPaymentsPage";
import EntityReportDetailPage from "../pages/reports/EntityReportDetailPage";
import ReportsPage from "../pages/reports/ReportsPage";
import ScopedEntityReportPage from "../pages/reports/ScopedEntityReportPage";
import StockPage from "../pages/stock/StockPage";
import TeamAccessPage from "../pages/team/TeamAccessPage";
import TransactionInvoicePage from "../pages/transactions/TransactionInvoicePage";
import TransactionDraftsPage from "../pages/transactions/TransactionDraftsPage";
import TransactionRecordPage from "../pages/transactions/TransactionRecordPage";
import TransactionsPage from "../pages/transactions/TransactionsPage";
import ProtectedRoute from "./ProtectedRoute";

/**
 * Single composition root for "what pages exist and at what path" in the
 * whole frontend. `App.tsx` only mounts `<BrowserRouter>` around this
 * component -- every actual `<Route>` definition lives here, alongside
 * `ProtectedRoute.tsx` and `accessControl.ts` in this same `routing/`
 * folder (see REPOSITORY_MAP.md).
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/access" element={<AccessBootstrapPage />} />
      <Route path="/dashboard-picker" element={<AccessBootstrapPage />} />
      <Route path="/invite" element={<InviteAcceptancePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/dashboard/master" element={<BaselineDashboardRoute view="master"><MasterOwnerDashboard /></BaselineDashboardRoute>} />
        <Route path="/dashboard/business" element={<BaselineDashboardRoute view="business"><BusinessAdminDashboard /></BaselineDashboardRoute>} />
        <Route path="/dashboard/shop" element={<BaselineDashboardRoute view="shop"><ShopManagerDashboard /></BaselineDashboardRoute>} />
        <Route path="/dashboard/personal" element={<BaselineDashboardRoute view="personal"><CashierDashboard /></BaselineDashboardRoute>} />
        <Route path="/dashboard/detail/:metricKey" element={<DashboardMetricDetailPage />} />
        <Route path="/dashboard/pending-payments" element={<Navigate to="/pending-payments" replace />} />
        <Route path="/dashboard/products" element={<Navigate to="/products" replace />} />
        <Route path="/pending-payments" element={<PendingPaymentsPage />} />
        <Route path="/shops" element={<ProtectedRoute routeKey="shops"><ScopedEntityReportPage kind="shops" /></ProtectedRoute>} />
        <Route path="/shops/:entityId" element={<ProtectedRoute routeKey="shops"><EntityReportDetailPage kind="shops" /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute routeKey="team"><ScopedEntityReportPage kind="employees" /></ProtectedRoute>} />
        <Route path="/employees/manage" element={<ProtectedRoute routeKey="team"><TeamAccessPage /></ProtectedRoute>} />
        <Route path="/employees/:entityId" element={<ProtectedRoute routeKey="team"><EntityReportDetailPage kind="employees" /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute routeKey="products"><ScopedEntityReportPage kind="products" /></ProtectedRoute>} />
        {/* Product management (catalog CRUD, CSV import, revenue table) moved
            into StockPage.tsx -- see debug.log for why the two pages were
            merged. Kept as a redirect rather than deleting the path outright
            since it may be bookmarked. */}
        <Route path="/products/manage" element={<Navigate to="/stock" replace />} />
        <Route path="/products/:entityId" element={<ProtectedRoute routeKey="products"><EntityReportDetailPage kind="products" /></ProtectedRoute>} />
        <Route path="/stock" element={<ProtectedRoute routeKey="stock" altRouteKey="products"><StockPage /></ProtectedRoute>} />
        <Route path="/transactions/new" element={<ProtectedRoute routeKey="recordTransaction"><TransactionRecordPage /></ProtectedRoute>} />
        <Route path="/transactions/drafts" element={<ProtectedRoute routeKey="transactionDrafts"><TransactionDraftsPage /></ProtectedRoute>} />
        <Route path="/transactions/:transactionId/invoice" element={<ProtectedRoute routeKey="transactions"><TransactionInvoicePage /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute routeKey="transactions"><TransactionsPage /></ProtectedRoute>} />
        <Route path="/businesses" element={<ProtectedRoute routeKey="businesses"><BusinessStructurePage /></ProtectedRoute>} />
        <Route path="/team" element={<Navigate to="/employees" replace />} />
        <Route path="/reports" element={<ProtectedRoute routeKey="reports"><ReportsPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard-picker" replace />} />
    </Routes>
  );
}
