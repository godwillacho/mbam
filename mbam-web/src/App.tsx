import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/app/AppShell";
import AuthPage from "./pages/auth/AuthPage";
import BusinessStructurePage from "./pages/business/BusinessStructurePage";
import MasterDashboard from "./pages/dashboard/MasterDashboard";
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
          <Route path="/transactions/new" element={<TransactionRecordPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/businesses" element={<BusinessStructurePage />} />
          <Route path="/team" element={<TeamAccessPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
