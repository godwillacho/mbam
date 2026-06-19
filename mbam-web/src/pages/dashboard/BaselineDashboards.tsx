import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import { workspace } from "../../data/mockWorkspace";
import { canAccessRoute, getCurrentMember } from "../../security/accessControl";
import {
  loadDashboardSummary,
  type DashboardLeader,
  type DashboardSummary,
} from "../../services/reportService";
import {
  listRecentCloudTransactions,
  type CloudTransaction,
} from "../../services/transactionService";
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
  quantity?: boolean;
}

const dashboardCopy: Record<
  BaselineKind,
  { title: string; description: string }
> = {
  master: {
    title: "Master owner dashboard",
    description: "Today's leaders across your authorized account scope.",
  },
  business: {
    title: "Business admin dashboard",
    description: "Today's leaders across your assigned businesses and shops.",
  },
  shop: {
    title: "Shop manager dashboard",
    description: "Today's sales leaders inside your assigned shops.",
  },
  cashier: {
    title: "Cashier dashboard",
    description: "Today's personal sales activity in your assigned shop.",
  },
};

const metricDefinitions: Record<BaselineKind, MetricDefinition[]> = {
  master: [
    { key: "business", label: "Top business", fallbackPath: "/businesses" },
    { key: "shop", label: "Top shop", fallbackPath: "/shops" },
    { key: "employee", label: "Top employee", fallbackPath: "/employees" },
    {
      key: "product",
      label: "Most-sold product",
      fallbackPath: "/products",
      quantity: true,
    },
  ],
  business: [
    { key: "business", label: "Top business", fallbackPath: "/businesses" },
    { key: "shop", label: "Top shop", fallbackPath: "/shops" },
    { key: "employee", label: "Top employee", fallbackPath: "/employees" },
    {
      key: "product",
      label: "Most-sold product",
      fallbackPath: "/products",
      quantity: true,
    },
  ],
  shop: [
    { key: "shop", label: "Top assigned shop", fallbackPath: "/shops" },
    {
      key: "employee",
      label: "Top cashier",
      fallbackPath: "/employees",
    },
    {
      key: "product",
      label: "Most-sold product",
      fallbackPath: "/products",
      quantity: true,
    },
  ],
  cashier: [
    { key: "shop", label: "My shop sales", fallbackPath: "/shops" },
    {
      key: "product",
      label: "My most-sold product",
      fallbackPath: "/products",
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
  const path = leader?.detail_path ?? definition.fallbackPath;
  const value = leader
    ? definition.quantity
      ? `${leader.primary_value.toLocaleString()} sold`
      : formatMoney(leader.primary_value, currency)
    : "No sales yet";

  return (
    <Link
      aria-label={`${definition.label}: ${leader?.entity_name ?? "no data"}`}
      className="metric-card dashboard-metric-link"
      to={path}
    >
      <span>{definition.label}</span>
      <strong>{leader?.entity_name ?? "No authorized activity"}</strong>
      <small>{value}</small>
      <AuthorizedLineChart
        compact
        label={definition.label}
        points={leader?.points ?? []}
        quantity={definition.quantity}
      />
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
  const member = getCurrentMember();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [transactions, setTransactions] = useState<CloudTransaction[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const currency = workspace.businesses[0]?.currency ?? "XAF";
  const definitions = useMemo(() => metricDefinitions[kind], [kind]);
  const showRecent = kind === "shop" || kind === "cashier";

  useEffect(() => {
    let ignore = false;
    setState("loading");
    Promise.all([
      loadDashboardSummary(),
      showRecent ? listRecentCloudTransactions() : Promise.resolve([]),
    ])
      .then(([nextSummary, nextTransactions]) => {
        if (ignore) return;
        setSummary(nextSummary);
        setTransactions(nextTransactions);
        setState("ready");
      })
      .catch(() => {
        if (ignore) return;
        setSummary(null);
        setTransactions([]);
        setState("error");
      });
    return () => {
      ignore = true;
    };
  }, [showRecent]);

  const copy = dashboardCopy[kind];

  return (
    <section className="page-grid role-dashboard-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">Today</span>
          <h2>{copy.title}</h2>
          <p className="card-muted">{copy.description}</p>
        </div>
        {canAccessRoute(member, "recordTransaction") && (
          <div className="dashboard-heading-action">
            <Link className="primary-btn" to="/transactions/new">
              Record transaction
            </Link>
          </div>
        )}
      </div>

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
