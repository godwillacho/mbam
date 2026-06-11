import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { canAccessRoute, getCurrentMember, type AppRouteKey } from "../../security/accessControl";
import LanguageSwitcher from "./LanguageSwitcher";
import "./AppShell.css";

const navItems: Array<{ to: string; labelKey: string; routeKey?: AppRouteKey }> = [
  { to: "/dashboard", labelKey: "app.nav.dashboard" },
  { to: "/transactions/new", labelKey: "app.nav.recordTransaction", routeKey: "recordTransaction" },
  { to: "/transactions", labelKey: "app.nav.transactions", routeKey: "transactions" },
  { to: "/businesses", labelKey: "app.nav.businesses", routeKey: "businesses" },
  { to: "/team", labelKey: "app.nav.team", routeKey: "team" },
  { to: "/reports", labelKey: "app.nav.reports", routeKey: "reports" },
];

export default function AppShell() {
  const { t } = useTranslation();
  const currentMember = getCurrentMember();
  const visibleNavItems = navItems.filter((item) => !item.routeKey || canAccessRoute(currentMember, item.routeKey));

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
          {visibleNavItems.map((item) => (
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
