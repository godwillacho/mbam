import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
import { workspace } from "../../data/mockWorkspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { canViewDashboardMetric, getStoredDashboardMember, type DashboardMetricKey } from "./dashboardPermissions";
import "./DashboardMetricDetailPage.css";

const metricKeys: DashboardMetricKey[] = [
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

function isMetricKey(value: string | undefined): value is DashboardMetricKey {
  return !!value && metricKeys.includes(value as DashboardMetricKey);
}

function businessName(id: string) {
  return workspace.businesses.find((business) => business.id === id)?.name ?? "—";
}

function unitName(id: string) {
  return workspace.businessUnits.find((unit) => unit.id === id)?.name ?? "—";
}

function getScopedUnits(member = getStoredDashboardMember()) {
  if (member.scopeLevel === "master") return workspace.businessUnits;
  if (member.scopeLevel === "business" && member.businessId) {
    return workspace.businessUnits.filter((unit) => unit.businessId === member.businessId);
  }
  if (member.scopeLevel === "unit" && member.businessUnitId) {
    return workspace.businessUnits.filter((unit) => unit.id === member.businessUnitId);
  }
  return [];
}

export default function DashboardMetricDetailPage() {
  const { metricKey } = useParams();
  const { t } = useTranslation();
  const member = getStoredDashboardMember();

  if (!isMetricKey(metricKey) || !canViewDashboardMetric(member, metricKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  const scopedUnits = getScopedUnits(member);
  const scopedUnitIds = new Set(scopedUnits.map((unit) => unit.id));
  const scopedBusinessIds = new Set(scopedUnits.map((unit) => unit.businessId));
  const scopedTransactions = workspace.transactions.filter(
    (transaction) =>
      transaction.businessUnitId === undefined ||
      scopedUnitIds.has(transaction.businessUnitId),
  );
  const visibleTransactions = member.roleId === "role-cashier"
    ? scopedTransactions.filter((transaction) => transaction.recordedBy === member.fullName)
    : scopedTransactions;

  const renderMetricRows = () => {
    if (["totalRevenue", "businessRevenue", "unitRevenue", "ownSales"].includes(metricKey)) {
      return scopedUnits.map((unit) => {
        const transactions = visibleTransactions.filter((transaction) => transaction.businessUnitId === unit.id);
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
      return workspace.businesses.filter((business) => scopedBusinessIds.has(business.id)).map((business) => {
        const units = scopedUnits.filter((unit) => unit.businessId === business.id);
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
      return scopedUnits.map((unit) => (
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
      return workspace.teamMembers.filter((teamMember) => {
        if (member.scopeLevel === "master") return true;
        if (member.scopeLevel === "business") return teamMember.businessId === member.businessId;
        return teamMember.businessUnitId === member.businessUnitId || teamMember.id === member.id;
      }).map((teamMember) => (
        <article className="metric-detail-row" key={teamMember.id}>
          <div>
            <strong>{teamMember.fullName}</strong>
            <small>{teamMember.email} · {t(`roleDashboard.roleNames.${teamMember.roleId}`)}</small>
          </div>
          <span className={teamMember.status === "invited" ? "badge warning" : "badge"}>{t(`common.${teamMember.status}`)}</span>
        </article>
      ));
    }

    if (["transactions", "ownTransactions"].includes(metricKey)) {
      return visibleTransactions.map((transaction) => (
        <article className="metric-detail-row" key={transaction.id}>
          <div>
            <strong>{transaction.reference} · {transaction.customerName}</strong>
            <small>{transaction.businessUnitId ? unitName(transaction.businessUnitId) : businessName(transaction.businessId)} · {formatDateTime(transaction.createdAt)} · {t("roleDashboard.labels.recordedBy")}: {transaction.recordedBy}</small>
          </div>
          <span className={transaction.status === "queued" ? "badge warning" : "badge"}>{formatMoney(transaction.amount, workspace.masterAccount.currency)}</span>
        </article>
      ));
    }

    return workspace.products.filter((product) => !product.businessId || scopedBusinessIds.has(product.businessId)).map((product) => (
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
          <DevOnly><p>{t("metricDetails.description")}</p></DevOnly>
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
