import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/app/AppShell";
import ProtectedRoute from "./components/app/ProtectedRoute";
import AuthPage from "./pages/auth/AuthPage";
import BusinessStructurePage from "./pages/business/BusinessStructurePage";
import DashboardMetricDetailPage from "./pages/dashboard/DashboardMetricDetailPage";
import MasterDashboard from "./pages/dashboard/MasterDashboard";
import PendingPaymentsPage from "./pages/dashboard/PendingPaymentsPage";
import ProductRevenuePage from "./pages/products/ProductRevenuePage";
import ReportsPage from "./pages/reports/ReportsPage";
import TeamAccessPage from "./pages/team/TeamAccessPage";
import TransactionRecordPage from "./pages/transactions/TransactionRecordPage";
import TransactionsPage from "./pages/transactions/TransactionsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<MasterDashboard />} />
          <Route path="/dashboard/detail/:metricKey" element={<DashboardMetricDetailPage />} />
          <Route path="/dashboard/pending-payments" element={<PendingPaymentsPage />} />
          <Route path="/dashboard/products" element={<ProductRevenuePage />} />
          <Route path="/transactions/new" element={<ProtectedRoute routeKey="recordTransaction"><TransactionRecordPage /></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute routeKey="transactions"><TransactionsPage /></ProtectedRoute>} />
          <Route path="/businesses" element={<ProtectedRoute routeKey="businesses"><BusinessStructurePage /></ProtectedRoute>} />
          <Route path="/team" element={<ProtectedRoute routeKey="team"><TeamAccessPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute routeKey="reports"><ReportsPage /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
