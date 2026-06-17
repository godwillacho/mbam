import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../components/auth/AuthLayout";
import { workspace } from "../../data/mockWorkspace";
import {
  canAccessRoute,
  getCurrentMember,
  setCurrentMemberId,
  type AppRouteKey,
} from "../../security/accessControl";
import { getCurrentSession } from "../../services/authService";
import { clearActiveSession } from "../../services/authSessionStore";
import { hydrateCloudWorkspace } from "../../services/workspaceService";
import type { TeamMember } from "../../types/workspace";

const routeKeyByPath: Array<{ test: (path: string) => boolean; routeKey: AppRouteKey }> = [
  { test: (path) => path.startsWith("/transactions/new"), routeKey: "recordTransaction" },
  { test: (path) => path.startsWith("/transactions/drafts"), routeKey: "transactionDrafts" },
  { test: (path) => path.startsWith("/transactions"), routeKey: "transactions" },
  { test: (path) => path.startsWith("/products"), routeKey: "products" },
  { test: (path) => path.startsWith("/businesses"), routeKey: "businesses" },
  { test: (path) => path.startsWith("/team"), routeKey: "team" },
  { test: (path) => path.startsWith("/reports"), routeKey: "reports" },
];

function requestedPath(searchParams: URLSearchParams): string | null {
  const next = searchParams.get("next") ?? sessionStorage.getItem("mbam-auth-next");
  if (!next?.startsWith("/")) return null;
  if (next.startsWith("/auth") || next.startsWith("/access")) return null;
  return next;
}

function canEnterRequestedPath(member: TeamMember, path: string): boolean {
  if (path === "/" || path.startsWith("/dashboard")) return true;
  const route = routeKeyByPath.find((entry) => entry.test(path));
  return route ? canAccessRoute(member, route.routeKey) : false;
}

function defaultPathForMember(member: TeamMember): string {
  if (member.roleId === "role-cashier" && canAccessRoute(member, "recordTransaction")) {
    return "/transactions/new";
  }
  return "/dashboard";
}

function pathForMember(member: TeamMember, nextPath: string | null): string {
  if (nextPath && canEnterRequestedPath(member, nextPath)) return nextPath;
  return defaultPathForMember(member);
}

function memberScopeLabel(member: TeamMember): string {
  const unit = workspace.businessUnits.find((item) => item.id === member.businessUnitId);
  const business = workspace.businesses.find(
    (item) => item.id === (member.businessId ?? unit?.businessId),
  );
  if (business && unit) return `${business.name} / ${unit.name}`;
  if (business) return business.name;
  return "Workspace access";
}

export default function AccessBootstrapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = getCurrentSession();
  const nextPath = useMemo(() => requestedPath(searchParams), [searchParams]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberships, setMemberships] = useState<TeamMember[]>([]);

  useEffect(() => {
    let ignore = false;
    if (!session) return;

    setIsLoading(true);
    setError("");
    void hydrateCloudWorkspace()
      .then(() => {
        if (ignore) return;
        sessionStorage.removeItem("mbam-auth-next");
        const sessionEmail = session.user.email.toLowerCase();
        const matchingMemberships = workspace.teamMembers.filter(
          (member) => member.email.toLowerCase() === sessionEmail && member.status === "active",
        );
        const availableMemberships = matchingMemberships.length > 0
          ? matchingMemberships
          : [getCurrentMember()].filter(Boolean);

        if (availableMemberships.length <= 1) {
          const member = availableMemberships[0] ?? getCurrentMember();
          setCurrentMemberId(member.id);
          navigate(pathForMember(member, nextPath), { replace: true });
          return;
        }

        setMemberships(availableMemberships);
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
  }, [navigate, nextPath, session]);

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  const chooseMembership = (member: TeamMember) => {
    setCurrentMemberId(member.id);
    navigate(pathForMember(member, nextPath), { replace: true });
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
            Checking your assigned role, business, and shop permissions...
          </p>
        )}

        {!isLoading && memberships.length > 1 && (
          <>
            <p className="verify-body">Choose the workspace role you want to open.</p>
            <div className="field-group">
              {memberships.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="submit-btn"
                  onClick={() => chooseMembership(member)}
                >
                  {member.roleName ?? member.roleId} - {memberScopeLabel(member)}
                </button>
              ))}
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

        {!isLoading && memberships.length === 0 && !error && (
          <Link className="forgot-link" to="/auth" replace>
            Return to sign in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
