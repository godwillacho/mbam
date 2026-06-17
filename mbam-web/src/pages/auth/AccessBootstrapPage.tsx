import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../components/auth/AuthLayout";
import { profileBaselineDashboardPath } from "../dashboard/dashboardRoutes";
import { setCurrentMemberId } from "../../security/accessControl";
import { getCurrentSession } from "../../services/authService";
import { clearActiveSession } from "../../services/authSessionStore";
import { saveOfflineAuthorizationSnapshot } from "../../services/offlineAuthorizationSnapshotService";
import type { DashboardProfile } from "../../services/teamService";
import { hydrateAuthorizationWorkspace } from "../../services/workspaceService";

function requestedPath(searchParams: URLSearchParams): string | null {
  const next = searchParams.get("next") ?? sessionStorage.getItem("mbam-auth-next");
  if (!next?.startsWith("/") || next === "/") return null;
  if (next.startsWith("/auth") || next.startsWith("/access") || next.startsWith("/dashboard")) {
    return null;
  }
  return next;
}

function pathIsAllowed(profile: DashboardProfile, path: string): boolean {
  return profile.dashboards.some((dashboard) =>
    path === dashboard.path || path.startsWith(`${dashboard.path}/`),
  );
}

function selectedPath(profile: DashboardProfile, nextPath: string | null): string | null {
  if (nextPath && pathIsAllowed(profile, nextPath)) return nextPath;
  return profileBaselineDashboardPath(profile);
}

export default function AccessBootstrapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = useMemo(() => getCurrentSession(), []);
  const nextPath = useMemo(() => requestedPath(searchParams), [searchParams]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    if (!session) return;

    setIsLoading(true);
    setError("");
    void hydrateAuthorizationWorkspace()
      .then(async (team) => {
        if (ignore) return;
        sessionStorage.removeItem("mbam-auth-next");
        const profile = team?.dashboard_profiles.find(
          (candidate) => candidate.user_id === session.user.id,
        );
        if (!profile) {
          setError("no_active_dashboard_profile");
          setIsLoading(false);
          return;
        }

        const path = selectedPath(profile, nextPath);
        if (!path) {
          setError("no_allowed_dashboard_target");
          setIsLoading(false);
          return;
        }

        setCurrentMemberId(profile.membership_id);
        if (session.accessToken && team) {
          await saveOfflineAuthorizationSnapshot(session, team, path).catch(() => undefined);
        }
        navigate(path, { replace: true });
      })
      .catch((loadError: unknown) => {
        if (ignore) return;
        setError(loadError instanceof Error ? loadError.message : "access_load_failed");
        setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [navigate, nextPath, session]);

  if (!session) return <Navigate to="/auth" replace />;

  const signInAgain = () => {
    clearActiveSession();
    navigate("/auth", { replace: true });
  };

  return (
    <AuthLayout mode="login">
      <div className="verify-screen" role="status">
        <div className="verify-icon">✓</div>
        <h2 className="verify-title">Loading your access</h2>
        {isLoading && <p className="verify-body">Validating your token, baseline role, and assigned scope...</p>}
        {!isLoading && error && (
          <>
            <div className="alert alert-danger" role="alert">Could not load your assigned access. {error}</div>
            <button type="button" className="submit-btn" onClick={() => window.location.reload()}>Try again</button>
            <button type="button" className="forgot-link" onClick={signInAgain}>Sign in again</button>
          </>
        )}
        {!isLoading && !error && <Link className="forgot-link" to="/auth" replace>Return to sign in</Link>}
      </div>
    </AuthLayout>
  );
}
