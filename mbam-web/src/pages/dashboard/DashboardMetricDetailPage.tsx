import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./DashboardMetricDetailPage.css";

type MetricKey =
  | "totalRevenue"
  | "businesses"
  | "units"
  | "queued"
  | "team"
  | "businessRevenue"
  | "unitRevenue"
  | "transactions"
  | "ownSales"
  | "ownTransactions"
  | "products";

const metricKeys: MetricKey[] = [
  "totalRevenue",
  "businesses",
  "units",
  "queued",
  "team",
  "businessRevenue",
  "unitRevenue",
  "transactions",
  "ownSales",
  "ownTransactions",
  "products",
];

function isMetricKey(value: string | undefined): value is MetricKey {
  return !!value && metricKeys.includes(value as MetricKey);
}

function businessName(id: string) {
  return workspace.businesses.find((business) => business.id === id)?.name ?? "—";
}

function unitName(id: string) {
  return workspace.businessUnits.find((unit) => unit.id === id)?.name ?? "—";
}

export default function DashboardMetricDetailPage() {
  const { metricKey } = useParams();
  const { t } = useTranslation();

  if (!isMetricKey(metricKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  const renderMetricRows = () => {
    if (["totalRevenue", "businessRevenue", "unitRevenue", "ownSales"].includes(metricKey)) {
      return workspace.businessUnits.map((unit) => {
        const transactions = workspace.transactions.filter((transaction) => transaction.businessUnitId === unit.id);
        const amount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0) || unit.todayRevenue;

        return (
          <article className="metric-detail-row" key={unit.id}>
            <div>
              <strong>{unit.name}</strong>
              <small>{businessName(unit.businessId)} · {unit.location}</small>
            </div>
            <span className="badge">{formatMoney(amount, workspace.masterAccount.currency)}</span>
          </article>
        );
      });
    }

    if (metricKey === "businesses") {
      return workspace.businesses.map((business) => {
        const units = workspace.businessUnits.filter((unit) => unit.businessId === business.id);
        const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);

        return (
          <article className="metric-detail-row" key={business.id}>
            <div>
              <strong>{business.name}</strong>
              <small>{business.type} · {t("roleDashboard.labels.units")}: {units.length}</small>
            </div>
            <span className="badge">{formatMoney(revenue, business.currency)}</span>
          </article>
        );
      });
    }

    if (["units", "queued"].includes(metricKey)) {
      return workspace.businessUnits.map((unit) => (
        <article className="metric-detail-row" key={unit.id}>
          <div>
            <strong>{unit.name}</strong>
            <small>{businessName(unit.businessId)} · {unit.location}</small>
          </div>
          <span className={unit.queuedTransactions > 0 ? "badge warning" : "badge"}>
            {unit.queuedTransactions > 0 ? t("dashboard.queuedCount", { count: unit.queuedTransactions }) : t("dashboard.synced")}
          </span>
        </article>
      ));
    }

    if (metricKey === "team") {
      return workspace.teamMembers.map((member) => (
        <article className="metric-detail-row" key={member.id}>
          <div>
            <strong>{member.fullName}</strong>
            <small>{member.email} · {t(`roleDashboard.roleNames.${member.roleId}`)}</small>
          </div>
          <span className={member.status === "invited" ? "badge warning" : "badge"}>{t(`common.${member.status}`)}</span>
        </article>
      ));
    }

    if (["transactions", "ownTransactions"].includes(metricKey)) {
      return workspace.transactions.map((transaction) => (
        <article className="metric-detail-row" key={transaction.id}>
          <div>
            <strong>{transaction.reference} · {transaction.customerName}</strong>
            <small>{unitName(transaction.businessUnitId)} · {formatDateTime(transaction.createdAt)} · {t("roleDashboard.labels.recordedBy")}: {transaction.recordedBy}</small>
          </div>
          <span className={transaction.status === "queued" ? "badge warning" : "badge"}>{formatMoney(transaction.amount, workspace.masterAccount.currency)}</span>
        </article>
      ));
    }

    return workspace.products.map((product) => (
      <article className="metric-detail-row" key={product.id}>
        <div>
          <strong>{product.name}</strong>
          <small>{businessName(product.businessId ?? "")} · {product.sku ?? t("common.noSku")}</small>
        </div>
        <span className="badge">{product.timesSold}</span>
      </article>
    ));
  };

  return (
    <section className="page-grid metric-detail-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("metricDetails.eyebrow")}</span>
          <h2>{t(`roleDashboard.metrics.${metricKey}`)}</h2>
          <p>{t("metricDetails.description")}</p>
        </div>
        <Link className="secondary-btn" to="/dashboard">{t("pendingPayments.backToDashboard")}</Link>
      </div>

      <article className="card metric-detail-card">
        <header>
          <span className="eyebrow">{t("metricDetails.fullPage")}</span>
          <h3>{t(`roleDashboard.detail.${metricKey}`)}</h3>
        </header>
        <div className="metric-detail-list">{renderMetricRows()}</div>
      </article>
    </section>
  );
}
