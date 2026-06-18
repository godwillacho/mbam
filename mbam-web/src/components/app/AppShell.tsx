import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isDemoWorkspace, WORKSPACE_CHANGE_EVENT, workspace } from "../../data/mockWorkspace";
import { baselineDashboardPath } from "../../pages/dashboard/dashboardRoutes";
import { getCurrentSession } from "../../services/authService";
import { API_AUTH_LOCK_EVENT } from "../../services/apiClient";
import { getAccessToken } from "../../services/authSessionStore";
import { createApiSyncTransport, synchronizeOfflineChanges } from "../../services/offlineSyncService";
import { isOfflineVaultUnlocked } from "../../services/offlineVaultService";
import { hydrateAuthorizationWorkspace, hydrateCloudWorkspace } from "../../services/workspaceService";
import {
  canAccessRoute,
  CURRENT_MEMBER_CHANGE_EVENT,
  getCurrentMember,
  setCurrentMemberId,
  type AppRouteKey,
} from "../../security/accessControl";
import LanguageSwitcher from "./LanguageSwitcher";
import "./AppShell.css";

const navItems: Array<{ to: string; labelKey: string; routeKey?: AppRouteKey }> = [
  { to: "/dashboard", labelKey: "app.nav.dashboard" },
  { to: "/transactions/new", labelKey: "app.nav.recordTransaction", routeKey: "recordTransaction" },
  { to: "/transactions/drafts", labelKey: "app.nav.drafts", routeKey: "transactionDrafts" },
  { to: "/transactions", labelKey: "app.nav.transactions", routeKey: "transactions" },
  { to: "/businesses", labelKey: "app.nav.businesses", routeKey: "businesses" },
  { to: "/team", labelKey: "app.nav.team", routeKey: "team" },
  { to: "/products", labelKey: "app.nav.products", routeKey: "products" },
  { to: "/reports", labelKey: "app.nav.reports", routeKey: "reports" },
];

const isDevEnvironment = import.meta.env.DEV;
type HydrationState = "loading" | "ready" | "failed";

export default function AppShell() {
  const { t } = useTranslation();
  const [currentMember, setCurrentMember] = useState(() => getCurrentMember());
  const [authLocked, setAuthLocked] = useState(false);
  const [hydrationState, setHydrationState] = useState<HydrationState>("loading");
  const [, setWorkspaceVersion] = useState(0);
  const dashboardPath = baselineDashboardPath(currentMember) ?? "/dashboard";
  const visibleNavItems = navItems.filter((item) => !item.routeKey || canAccessRoute(currentMember, item.routeKey));
  const workspaceName = workspace.masterAccount.name || t("app.defaultWorkspaceName");

  useEffect(() => {
    const syncCurrentMember = () => setCurrentMember(getCurrentMember());
    window.addEventListener(CURRENT_MEMBER_CHANGE_EVENT, syncCurrentMember);
    return () => window.removeEventListener(CURRENT_MEMBER_CHANGE_EVENT, syncCurrentMember);
  }, []);

  useEffect(() => {
    const lockSession = () => setAuthLocked(true);
    window.addEventListener(API_AUTH_LOCK_EVENT, lockSession);
    return () => window.removeEventListener(API_AUTH_LOCK_EVENT, lockSession);
  }, []);

  useEffect(() => {
    let ignore = false;
    const refreshWorkspace = () => {
      setCurrentMember(getCurrentMember());
      setWorkspaceVersion((version) => version + 1);
    };
    window.addEventListener(WORKSPACE_CHANGE_EVENT, refreshWorkspace);
    setHydrationState("loading");
    void hydrateAuthorizationWorkspace()
      .then((team) => {
        if (ignore || !team) return;
        refreshWorkspace();
        setHydrationState("ready");
        void hydrateCloudWorkspace(team).catch(() => undefined);
      })
      .catch(() => {
        if (!ignore) setHydrationState("failed");
      });
    return () => {
      ignore = true;
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, refreshWorkspace);
    };
  }, []);

  useEffect(() => {
    const synchronize = () => {
      if (navigator.onLine && getAccessToken() && isOfflineVaultUnlocked()) {
        void synchronizeOfflineChanges(createApiSyncTransport()).catch(() => undefined);
      }
    };
    synchronize();
    window.addEventListener("online", synchronize);
    return () => window.removeEventListener("online", synchronize);
  }, []);

  if (authLocked || !getCurrentSession()) return <Navigate to="/auth" replace />;

  if (hydrationState === "loading") {
    return <div className="app-shell app-shell-loading"><main className="main-panel"><section className="page-grid"><p className="card-muted">Loading your validated role...</p></section></main></div>;
  }

  if (hydrationState === "failed") {
    return <Navigate to="/dashboard-picker" replace />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-symbol">M</span><div><strong>Mbam</strong><small>{workspaceName}</small></div></div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {visibleNavItems.map((item) => {
            const target = item.to === "/dashboard" ? dashboardPath : item.to;
            return (
              <NavLink key={item.to} to={target} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                {item.to === "/dashboard"
                  ? currentMember.roleId.startsWith("role-custom-member-") ? currentMember.roleName : t(`roleDashboard.roleNames.${currentMember.roleId}`)
                  : t(item.labelKey)}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-card"><span>{t("app.ownerLabel")}</span><strong>{currentMember.roleName ?? t(`roles.${currentMember.roleId}`)}</strong><small>{workspaceName}</small></div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div><span className="eyebrow">{currentMember.roleName ?? t(`roles.${currentMember.roleId}`)}</span><h1>{currentMember.fullName}</h1></div>
          <div className="topbar-actions">
            {isDevEnvironment && isDemoWorkspace() && (
              <label className="dev-account-switcher"><span>{t("app.devAccount")}</span><select value={currentMember.id} onChange={(event) => { setCurrentMemberId(event.target.value); setCurrentMember(getCurrentMember()); }}>
                {workspace.teamMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName} — {t(`roles.${member.roleId}`)}</option>)}
              </select></label>
            )}
            <LanguageSwitcher />
            <div className="sync-pill"><span className="sync-dot" />{t("app.readyToSync")}</div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
