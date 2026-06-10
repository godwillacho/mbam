import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import LanguageSwitcher from "./LanguageSwitcher";
import "./AppShell.css";

const navItems = [
  { to: "/dashboard", labelKey: "app.nav.dashboard" },
  { to: "/transactions/new", labelKey: "app.nav.recordTransaction" },
  { to: "/transactions", labelKey: "app.nav.transactions" },
  { to: "/businesses", labelKey: "app.nav.businesses" },
  { to: "/team", labelKey: "app.nav.team" },
  { to: "/reports", labelKey: "app.nav.reports" },
];

export default function AppShell() {
  const { t } = useTranslation();

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
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <span>{t("app.ownerLabel")}</span>
          <strong>{workspace.masterAccount.ownerName}</strong>
          <small>{t("app.masterScope")}</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">{t("app.workspaceLabel")}</span>
            <h1>{workspace.masterAccount.name}</h1>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <div className="sync-pill">
              <span className="sync-dot" />
              {t("app.readyToSync")}
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
