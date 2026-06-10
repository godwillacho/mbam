import { NavLink, Outlet } from "react-router-dom";
import { workspace } from "../../data/mockWorkspace";
import "./AppShell.css";

const navItems = [
  { to: "/dashboard", label: "Master dashboard" },
  { to: "/transactions/new", label: "Record transaction" },
  { to: "/transactions", label: "Transactions" },
  { to: "/businesses", label: "Businesses & shops" },
  { to: "/team", label: "Team access" },
  { to: "/reports", label: "Reports" },
];

export default function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-symbol">M</span>
          <div>
            <strong>Mbam</strong>
            <small>{workspace.masterAccount.name}</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <span>Current owner</span>
          <strong>{workspace.masterAccount.ownerName}</strong>
          <small>Master account scope</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">Offline-first workspace</span>
            <h1>{workspace.masterAccount.name}</h1>
          </div>
          <div className="sync-pill">
            <span className="sync-dot" />
            Ready to sync
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
