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

interface DashboardOption {
  routeKey?: AppRouteKey;
  path: string;
  label: string;
  description: string;
  primary?: boolean;
}

const routeKeyByPath: Array<{ test: (path: string) => boolean; routeKey: AppRouteKey }> = [
  { test: (path) => path.startsWith("/transactions/new"), routeKey: "recordTransaction" },
  { test: (path) => path.startsWith("/transactions/drafts"), routeKey: "transactionDrafts" },
  { test: (path) => path.startsWith("/transactions"), routeKey: "transactions" },
  { test: (path) => path.startsWith("/products"), routeKey: "products" },
  { test: (path) => path.startsWith("/businesses"), routeKey: "businesses" },
  { test: (path) => path.startsWith("/team"), routeKey: "team" },
  { test: (path) => path.startsWith("/reports"), routeKey: "reports" },
];

const dashboardOptions: DashboardOption[] = [
  {
    path: "/dashboard",
    label: "Role dashboard",
    description: "Open the dashboard filtered by this role and assigned scope.",
  },
  {
    routeKey: "recordTransaction",
    path: "/transactions/new",
    label: "Record sale",
    description: "Create a sale for the assigned business or shop.",
  },
  {
    routeKey: "transactionDrafts",
    path: "/transactions/drafts",
    label: "Drafts",
    description: "Continue saved transaction drafts.",
  },
  {
    routeKey: "transactions",
    path: "/transactions",
    label: "Transactions",
    description: "Review transactions allowed by this role.",
  },
  {
    routeKey: "products",
    path: "/products",
    label: "Products",
    description: "View or manage products in assigned scope.",
  },
  {
    routeKey: "businesses",
    path: "/businesses",
    label: "Business structure",
    description: "Manage granted businesses and shop units.",
  },
  {
    routeKey: "team",
    path: "/team",
    label: "Team access",
    description: "Invite and manage employees where permitted.",
  },
  {
    routeKey: "reports",
    path: "/reports",
    label: "Reports",
    description: "Open reporting for the permitted scope.",
  },
];

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

function canEnterRequestedPath(member: TeamMember, path: string): boolean {
  if (path === "/" || path.startsWith("/dashboard")) return true;
  const route = routeKeyByPath.find((entry) => entry.test(path));
  return route ? canAccessRoute(member, route.routeKey) : false;
}

function optionsForMember(member: TeamMember, nextPath: string | null): DashboardOption[] {
  const allowedOptions = dashboardOptions.filter((option) =>
    option.routeKey ? canAccessRoute(member, option.routeKey) : true,
  );

  if (nextPath && canEnterRequestedPath(member, nextPath)) {
    return [
      {
        path: nextPath,
        label: "Continue where you left off",
        description: "Open the page requested before sign-in.",
        primary: true,
      },
      ...allowedOptions,
    ];
  }

  const primaryPath = member.roleId === "role-cashier" && canAccessRoute(member, "recordTransaction")
    ? "/transactions/new"
    : "/dashboard";

  return allowedOptions.map((option) => ({
    ...option,
    primary: option.path === primaryPath,
  }));
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

function roleLabel(member: TeamMember): string {
  return member.roleName ?? member.roleId.replace(/^role-/, "").replace(/-/g, " ");
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
  }, [nextPath, session]);

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  const openDashboard = (member: TeamMember, path: string) => {
    setCurrentMemberId(member.id);
    navigate(path, { replace: true });
  };

  const signInAgain = () => {
    clearActiveSession();
    navigate("/auth", { replace: true });
  };

  return (
    <AuthLayout mode="login">
      <div className="verify-screen" role="status">
        <div className="verify-icon">✓</div>
        <h2 className="verify-title">Dashboard picker</h2>
        {isLoading && (
          <p className="verify-body">
            Validating your token and loading your role permissions from the API...
          </p>
        )}

        {!isLoading && memberships.length > 0 && (
          <>
            <p className="verify-body">
              Choose an access level. Each option below is built from your authenticated role and API permissions.
            </p>
            <div className="field-group">
              {memberships.map((member) => {
                const options = optionsForMember(member, nextPath);
                return (
                  <section className="verify-screen" key={member.id}>
                    <h3 className="verify-title">{roleLabel(member)}</h3>
                    <p className="verify-body">{memberScopeLabel(member)}</p>
                    {options.map((option) => (
                      <button
                        key={`${member.id}-${option.path}-${option.label}`}
                        type="button"
                        className={option.primary ? "submit-btn" : "forgot-link"}
                        onClick={() => openDashboard(member, option.path)}
                      >
                        {option.label}
                        <span className="verify-body">{option.description}</span>
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

        {!isLoading && memberships.length === 0 && !error && (
          <Link className="forgot-link" to="/auth" replace>
            Return to sign in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}
