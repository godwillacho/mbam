import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import { workspace } from "../../data/mockWorkspace";
import {
  canAccessRoute,
  getCurrentMember,
  type AppRouteKey,
} from "../../routing/accessControl";
import {
  loadDashboardSummary,
  type DashboardLeader,
  type DashboardSummary,
} from "../../services/reports/reportService";
import { logger } from "../../services/logging/logger";
import {
  listRecentCloudTransactions,
  type CloudTransaction,
} from "../../services/transactions/transactionService";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./MasterDashboard.css";

type BaselineKind = "master" | "business" | "shop" | "cashier";
type MetricKey = keyof DashboardSummary;

interface BaselineDashboardProps {
  kind: BaselineKind;
}

interface MetricDefinition {
  key: MetricKey;
  label: string;
  fallbackPath: string;
  routeKey: AppRouteKey;
  quantity?: boolean;
}

// Live-traffic demo/test data (see mbam-api's dev_demo_data.rs) keeps
// inserting new transactions in the background, so poll for fresh dashboard
// data periodically instead of only fetching once on mount.
const DASHBOARD_POLL_INTERVAL_MS = 30_000;

const metricDefinitions: Record<BaselineKind, MetricDefinition[]> = {
  master: [
    { key: "business", label: "Top business", fallbackPath: "/businesses", routeKey: "businesses" },
    { key: "shop", label: "Top shop", fallbackPath: "/shops", routeKey: "shops" },
    { key: "employee", label: "Top employee", fallbackPath: "/employees", routeKey: "team" },
    {
      key: "product",
      label: "Most-sold product",
      fallbackPath: "/products",
      routeKey: "products",
      quantity: true,
    },
  ],
  business: [
    { key: "business", label: "Top business", fallbackPath: "/businesses", routeKey: "businesses" },
    { key: "shop", label: "Top shop", fallbackPath: "/shops", routeKey: "shops" },
    { key: "employee", label: "Top employee", fallbackPath: "/employees", routeKey: "team" },
    {
      key: "product",
      label: "Most-sold product",
      fallbackPath: "/products",
      routeKey: "products",
      quantity: true,
    },
  ],
  shop: [
    { key: "shop", label: "Top assigned shop", fallbackPath: "/shops", routeKey: "shops" },
    {
      key: "employee",
      label: "Top cashier",
      fallbackPath: "/employees",
      routeKey: "team",
    },
    {
      key: "product",
      label: "Most-sold product",
      fallbackPath: "/products",
      routeKey: "products",
      quantity: true,
    },
  ],
  cashier: [
    { key: "shop", label: "My shop sales", fallbackPath: "/shops", routeKey: "shops" },
    {
      key: "product",
      label: "My most-sold product",
      fallbackPath: "/products",
      routeKey: "products",
      quantity: true,
    },
  ],
};

function MetricCell({
  definition,
  leader,
  currency,
}: {
  definition: MetricDefinition;
  leader?: DashboardLeader;
  currency: string;
}) {
  const { t } = useTranslation();
  const path = leader?.detail_path ?? definition.fallbackPath;
  const valueFormatter = useMemo(
    () => (definition.quantity
      ? (amount: number) => t("scopedEntityReport.unitsSold", { count: Math.round(amount) })
      : (amount: number) => formatMoney(amount, currency)),
    [currency, definition.quantity, t],
  );
  const value = leader ? valueFormatter(leader.primary_value) : "";

  useEffect(() => {
    if (!leader) {
      logger.debug("Dashboard metric cell has no leader data", {
        metricKey: definition.key,
        routeKey: definition.routeKey,
      });
    }
  }, [leader, definition.key, definition.routeKey]);

  return (
    <Link
      aria-label={`${definition.label}: ${leader?.entity_name ?? "no data"}`}
      className="metric-card dashboard-metric-link"
      to={path}
    >
      <div className="dashboard-metric-header">
        <span>{definition.label}</span>
        <strong>{leader?.entity_name ?? ""}</strong>
        <small>{value}</small>
      </div>
      <div className="dashboard-metric-chart">
        <AuthorizedLineChart
          emptyLabel={t("roleDashboard.drill.graphEmpty")}
          label={definition.label}
          points={leader?.points ?? []}
          quantity={definition.quantity}
          valueFormatter={valueFormatter}
        />
      </div>
    </Link>
  );
}

function RecentTransactions({
  transactions,
  currency,
}: {
  transactions: CloudTransaction[];
  currency: string;
}) {
  return (
    <article className="card dashboard-detail-card full-width-detail-card">
      <header>
        <div>
          <span className="eyebrow">Recent transactions</span>
          <h3>Newest authorized sales</h3>
        </div>
        <span className="badge">{transactions.length}</span>
      </header>
      {transactions.length === 0 ? (
        <p className="card-muted">No transactions are available in your scope.</p>
      ) : (
        <div className="compact-transaction-table" role="table">
          {transactions.map((transaction) => (
            <Link
              className="compact-transaction-row"
              key={transaction.id}
              role="row"
              to={`/transactions/${transaction.id}/invoice`}
            >
              <span>
                <strong>{transaction.id.slice(0, 8).toUpperCase()}</strong>
                <small>{transaction.customerName}</small>
              </span>
              <span>
                <strong>{transaction.recordedBy}</strong>
                <small>{formatDateTime(transaction.createdAt)}</small>
              </span>
              <strong>{formatMoney(transaction.totalAmount, currency)}</strong>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

function BaselineDashboard({ kind }: BaselineDashboardProps) {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [transactions, setTransactions] = useState<CloudTransaction[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const currency = workspace.businesses[0]?.currency ?? "XAF";
  const definitions = useMemo(
    () => metricDefinitions[kind].filter((definition) => canAccessRoute(member, definition.routeKey)),
    [kind, member],
  );
  const showRecent =
    (kind === "shop" || kind === "cashier") && canAccessRoute(member, "transactions");

  useEffect(() => {
    let ignore = false;

    const fetchDashboardData = (isInitialLoad: boolean) => {
      if (isInitialLoad) setState("loading");
      return Promise.all([
        loadDashboardSummary(),
        showRecent ? listRecentCloudTransactions() : Promise.resolve([]),
      ])
        .then(([nextSummary, nextTransactions]) => {
          if (ignore) return;
          setSummary(nextSummary);
          setTransactions(nextTransactions);
          setState("ready");
        })
        .catch((error: unknown) => {
          if (ignore) return;
          if (isInitialLoad) {
            setSummary(null);
            setTransactions([]);
            setState("error");
          } else {
            // A background refresh failed (e.g. a transient network blip).
            // Keep showing the last good data instead of replacing it with
            // an error state.
            logger.debug("Background dashboard refresh failed; keeping last known data", {
              error,
            });
          }
        });
    };

    void fetchDashboardData(true);
    const intervalId = window.setInterval(() => {
      void fetchDashboardData(false);
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, [showRecent]);

  return (
    <section className="page-grid role-dashboard-page">
      {state === "loading" && (
        <div className="card dashboard-state" role="status">
          Loading authorized dashboard metrics…
        </div>
      )}
      {state === "error" && (
        <div className="validation-summary" role="alert">
          Dashboard data could not be loaded. No cached broader data is shown.
        </div>
      )}
      {state === "ready" && (
        <>
          {definitions.length > 0 && (
            <div className="metrics-grid dashboard-leader-grid">
              {definitions.map((definition) => (
                <MetricCell
                  currency={currency}
                  definition={definition}
                  key={definition.key}
                  leader={summary?.[definition.key]}
                />
              ))}
            </div>
          )}
          {definitions.length === 0 && !showRecent && (
            <div className="card dashboard-state">
              {t("roleDashboard.noAuthorizedMetrics")}
            </div>
          )}
          {showRecent && (
            <RecentTransactions
              currency={currency}
              transactions={transactions}
            />
          )}
        </>
      )}
    </section>
  );
}

export function MasterOwnerDashboard() {
  return <BaselineDashboard kind="master" />;
}

export function BusinessAdminDashboard() {
  return <BaselineDashboard kind="business" />;
}

export function ShopManagerDashboard() {
  return <BaselineDashboard kind="shop" />;
}

export function CashierDashboard() {
  return <BaselineDashboard kind="cashier" />;
}
