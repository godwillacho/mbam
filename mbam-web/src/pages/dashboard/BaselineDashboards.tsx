import MasterDashboard from "./MasterDashboard";

export function MasterOwnerDashboard() {
  return <MasterDashboard forcedView="master" />;
}

export function BusinessAdminDashboard() {
  return <MasterDashboard forcedView="business" />;
}

export function ShopManagerDashboard() {
  return <MasterDashboard forcedView="shop" />;
}

export function CashierDashboard() {
  return <MasterDashboard forcedView="personal" />;
}
