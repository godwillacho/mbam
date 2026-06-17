import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../components/auth/AuthLayout";
import { setCurrentMemberId } from "../../security/accessControl";
import { getCurrentSession } from "../../services/authService";
import { clearActiveSession } from "../../services/authSessionStore";
import type { DashboardOption, DashboardProfile } from "../../services/teamService";
import { hydrateCloudWorkspace } from "../../services/workspaceService";

function requestedPath(searchParams: URLSearchParams): string | null {
  const next = searchParams.get("next") ?? sessionStorage.getItem("mbam-auth-next");
  if (!next?.startsWith("/")) return null;
  if (
    next.startsWith("/auth") ||
    next.startsWith("/access") ||
    next.startsWith("/dashboard-picker")
  ) {
    return null;
  }
  return next;
}

function pathIsAllowed(profile: DashboardProfile, path: string): boolean {
  if (path === "/" || path.startsWith("/dashboard")) return true;
  return profile.dashboards.some((dashboard) => path.startsWith(dashboard.path));
}

function optionsForProfile(
  profile: DashboardProfile,
  nextPath: string | null,
): DashboardOption[] {
  const dashboards = [...profile.dashboards].sort((left, right) => {
    if (left.is_baseline !== right.is_baseline) return left.is_baseline ? -1 : 1;
    return left.label.localeCompare(right.label);
  });

  if (nextPath && pathIsAllowed(profile, nextPath)) {
    return [
      {
        id: "continue",
        label: "Continue where you left off",
        description: "Open the page requested before sign-in.",
        path: nextPath,
        dashboard_type: "continue",
        is_baseline: true,
      },
      ...dashboards,
    ];
  }

  return dashboards;
}

export default function AccessBootstrapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = getCurrentSession();
  const nextPath = useMemo(() => requestedPath(searchParams), [searchParams]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);

  useEffect(() => {
    let ignore = false;
    if (!session) return;

    setIsLoading(true);
    setError("");
    void hydrateCloudWorkspace()
      .then((team) => {
        if (ignore) return;
        sessionStorage.removeItem("mbam-auth-next");
        const apiProfiles = team?.dashboard_profiles ?? [];
        setProfiles(apiProfiles);
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        if (ignore) return;
        setError(loadError instanceof Error ? loadError.message : "access_load_failed");
        setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [nextPath, session]);

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  const openDashboard = (profile: DashboardProfile, option: DashboardOption) => {
    setCurrentMemberId(profile.membership_id);
    navigate(option.path, { replace: true });
  };

  const signInAgain = () => {
    clearActiveSession();
    navigate("/auth", { replace: true });
  };

  return (
    <AuthLayout mode="login">
      <div className="verify-screen" role="status">
        <div className="verify-icon">✓</div>
        <h2 className="verify-title">Loading your access</h2>
        {isLoading && (
          <p className="verify-body">
            Validating your token and loading your API-assigned dashboards...
          </p>
        )}

        {!isLoading && profiles.length > 0 && (
          <>
            <p className="verify-body">
              Your available dashboards are validated by the API from your role, scope, and custom permissions.
            </p>
            <div className="field-group">
              {profiles.map((profile) => {
                const options = optionsForProfile(profile, nextPath);
                return (
                  <section className="field-group" key={profile.membership_id}>
                    <h3 className="verify-title">{profile.role_name}</h3>
                    <p className="verify-body">{profile.scope_label}</p>
                    {options.map((option) => (
                      <button
                        key={`${profile.membership_id}-${option.id}-${option.path}`}
                        type="button"
                        className={option.is_baseline ? "submit-btn" : "forgot-link"}
                        onClick={() => openDashboard(profile, option)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
          </>
        )}

        {!isLoading && error && (
          <>
            <div className="alert alert-danger" role="alert">
              Could not load your assigned access. {error}
            </div>
            <button type="button" className="submit-btn" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button type="button" className="forgot-link" onClick={signInAgain}>
              Sign in again
            </button>
          </>
        )}

        {!isLoading && profiles.length === 0 && !error && (
          <>
            <div className="alert alert-danger" role="alert">
              No active dashboard access was returned by the API for this account.
            </div>
            <Link className="forgot-link" to="/auth" replace>
              Return to sign in
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
