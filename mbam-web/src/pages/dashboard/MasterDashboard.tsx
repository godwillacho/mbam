import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
import {
  isDemoWorkspace,
  WORKSPACE_CHANGE_EVENT,
  workspace,
} from "../../data/mockWorkspace";
import { CURRENT_MEMBER_CHANGE_EVENT, getCurrentMember, getScopedPendingPayments } from "../../security/accessControl";
import type { Business, BusinessUnit, ProductProfile, TeamMember, TransactionRecord } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { getProductDescriptor } from "../../utils/productDisplay";
import { getDashboardMetricsForRole, type DashboardMetricKey } from "./dashboardPermissions";
import "./MasterDashboard.css";

const isDevEnvironment = import.meta.env.DEV;

interface DashboardMetric {
  key: DashboardMetricKey;
  value: string | number;
  hintKey: string;
}

function findBusiness(id?: string): Business | undefined {
  return workspace.businesses.find((business) => business.id === id);
}

function findUnit(id?: string): BusinessUnit | undefined {
  return workspace.businessUnits.find((unit) => unit.id === id);
}

function findCustomer(customerId: string) {
  return workspace.customers.find((customer) => customer.id === customerId);
}

function sumTransactions(records: TransactionRecord[]): number {
  return records.reduce((sum, record) => sum + record.amount, 0);
}

function sumPendingPayments(records: ReturnType<typeof getScopedPendingPayments>): number {
  return records.reduce((sum, payment) => sum + payment.outstandingAmount, 0);
}

function formatOptionalDate(value?: string): string {
  return value ? formatDateTime(value) : "—";
}

function getMemberScopeLabel(member: TeamMember, defaultWorkspaceName: string): string {
  const unit = findUnit(member.businessUnitId);
  const business = findBusiness(member.businessId ?? unit?.businessId);

  if (unit && business) return `${business.name} / ${unit.name}`;
  if (business) return business.name;
  return workspace.masterAccount.name || defaultWorkspaceName;
}

function getScopedUnits(member: TeamMember): BusinessUnit[] {
  if (member.scopeLevel === "master") return workspace.businessUnits;
  if (member.scopeLevel === "business" && member.businessId) {
    return workspace.businessUnits.filter((unit) => unit.businessId === member.businessId);
  }
  if (member.scopeLevel === "unit" && member.businessUnitId) {
    return workspace.businessUnits.filter((unit) => unit.id === member.businessUnitId);
  }
  return [];
}

function getScopedTransactions(member: TeamMember, units: BusinessUnit[]): TransactionRecord[] {
  const unitIds = new Set(units.map((unit) => unit.id));
  const transactions = workspace.transactions.filter(
    (transaction) =>
      transaction.businessUnitId === undefined ||
      unitIds.has(transaction.businessUnitId),
  );

  if (member.roleId === "role-cashier") {
    return transactions.filter((transaction) => transaction.recordedBy === member.fullName);
  }

  return transactions;
}

function getFullPagePath(metricKey: DashboardMetricKey): string {
  switch (metricKey) {
    case "businesses":
    case "units":
    case "team":
      return "/businesses";
    case "pendingCustomers":
      return "/pending-payments";
    case "transactions":
    case "ownTransactions":
      return "/transactions?date=today";
    case "queued":
      return "/transactions";
    case "products":
      return "/products";
    case "totalRevenue":
    case "businessRevenue":
    case "unitRevenue":
    case "ownSales":
    default:
      return "/reports";
  }
}

export default function MasterDashboard() {
  const { t } = useTranslation();
  const [selectedMember, setSelectedMember] = useState(() => getCurrentMember());
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricKey | null>(null);

  useEffect(() => {
    const syncCurrentMember = () => {
      setSelectedMember(getCurrentMember());
      setSelectedMetric(null);
    };
    window.addEventListener(CURRENT_MEMBER_CHANGE_EVENT, syncCurrentMember);
    window.addEventListener(WORKSPACE_CHANGE_EVENT, syncCurrentMember);
    return () => {
      window.removeEventListener(CURRENT_MEMBER_CHANGE_EVENT, syncCurrentMember);
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, syncCurrentMember);
    };
  }, []);

  const selectedRole = workspace.roles.find((role) => role.id === selectedMember.roleId);
  const allowedMetricKeys = getDashboardMetricsForRole(selectedMember.roleId);
  const isCashier = selectedMember.roleId === "role-cashier";
  const isMasterOwner = selectedMember.scopeLevel === "master";
  const isBusinessAdmin = selectedMember.scopeLevel === "business";
  const selectedUnit = findUnit(selectedMember.businessUnitId);
  const selectedBusiness = findBusiness(selectedMember.businessId ?? selectedUnit?.businessId);

  const scopedUnits = useMemo(() => getScopedUnits(selectedMember), [selectedMember]);
  const scopedTransactions = useMemo(() => getScopedTransactions(selectedMember, scopedUnits), [selectedMember, scopedUnits]);
  const scopedPendingPayments = useMemo(() => getScopedPendingPayments(selectedMember), [selectedMember]);
  const scopedBusinessIds = new Set(scopedUnits.map((unit) => unit.businessId));
  const scopedBusinesses = workspace.businesses.filter((business) => scopedBusinessIds.has(business.id));
  const scopedProducts = workspace.products.filter((product) => !product.businessId || scopedBusinessIds.has(product.businessId));
  const scopedTeam = workspace.teamMembers.filter((member) => {
    if (selectedMember.scopeLevel === "master") return true;
    if (selectedMember.scopeLevel === "business") return member.businessId === selectedMember.businessId;
    return member.businessUnitId === selectedMember.businessUnitId || member.id === selectedMember.id;
  });

  const transactionRevenue = sumTransactions(scopedTransactions);
  const unitRevenue = scopedUnits.reduce((sum, unit) => sum + unit.todayRevenue, 0);
  const displayedRevenue = transactionRevenue > 0 ? transactionRevenue : unitRevenue;
  const queuedTransactions = scopedUnits.reduce((sum, unit) => sum + unit.queuedTransactions, 0);
  const pendingOutstanding = sumPendingPayments(scopedPendingPayments);

  const allMetrics = useMemo<DashboardMetric[]>(() => [
    { key: "totalRevenue", value: formatMoney(displayedRevenue, workspace.masterAccount.currency), hintKey: "allUnits" },
    { key: "businesses", value: scopedBusinesses.length, hintKey: "masterBusinesses" },
    { key: "units", value: scopedUnits.length, hintKey: "allUnits" },
    { key: "queued", value: queuedTransactions, hintKey: "offlineSync" },
    { key: "team", value: scopedTeam.length, hintKey: "activeTeam" },
    { key: "pendingCustomers", value: formatMoney(pendingOutstanding, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "pendingFollowUp" },
    { key: "businessRevenue", value: formatMoney(displayedRevenue, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "assignedScope" },
    { key: "unitRevenue", value: formatMoney(displayedRevenue, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "assignedScope" },
    { key: "transactions", value: scopedTransactions.length, hintKey: "assignedScope" },
    { key: "ownSales", value: formatMoney(displayedRevenue, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "ownActivity" },
    { key: "ownTransactions", value: scopedTransactions.length, hintKey: "ownActivity" },
    { key: "products", value: scopedProducts.length, hintKey: "assignedScope" },
  ], [displayedRevenue, pendingOutstanding, queuedTransactions, scopedBusinesses.length, scopedProducts.length, scopedTeam.length, scopedTransactions.length, scopedUnits.length, selectedBusiness]);

  const metrics = allMetrics.filter((metric) => allowedMetricKeys.includes(metric.key));
  const activeMetric = metrics.find((metric) => metric.key === selectedMetric) ?? metrics[0];
  const activeMetricKey = activeMetric.key;
  const detailPath = getFullPagePath(activeMetricKey);

  const renderTransactions = (records: TransactionRecord[]) => {
    if (records.length === 0) {
      return <p className="card-muted">{t("roleDashboard.labels.noRecords")}</p>;
    }

    return (
      <div className="list-stack summary-two-column-list">
        {records.slice(0, 4).map((transaction) => (
          <div className="list-item" key={transaction.id}>
            <div>
              <strong>{transaction.reference} · {transaction.customerName}</strong>
              <small>{t("roleDashboard.labels.recordedBy")}: {transaction.recordedBy}</small>
            </div>
            <span className={transaction.status === "queued" ? "badge warning" : "badge"}>
              {formatMoney(transaction.amount, selectedBusiness?.currency ?? workspace.masterAccount.currency)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderUnits = () => (
    <div className="list-stack summary-two-column-list">
      {scopedUnits.slice(0, 4).map((unit) => (
        <div className="list-item" key={unit.id}>
          <div>
            <strong>{unit.name}</strong>
            <small>{unit.location} · {t(`unitTypes.${unit.type}`)}</small>
          </div>
          <span className={unit.queuedTransactions > 0 ? "badge warning" : "badge"}>
            {unit.queuedTransactions > 0 ? t("dashboard.queuedCount", { count: unit.queuedTransactions }) : t("dashboard.synced")}
          </span>
        </div>
      ))}
    </div>
  );

  const renderRevenue = () => (
    <div className="list-stack summary-two-column-list">
      {scopedUnits.slice(0, 4).map((unit) => {
        const unitTransactions = scopedTransactions.filter((transaction) => transaction.businessUnitId === unit.id);
        const revenue = sumTransactions(unitTransactions) || unit.todayRevenue;

        return (
          <div className="list-item" key={unit.id}>
            <div>
              <strong>{unit.name}</strong>
              <small>{unit.location}</small>
            </div>
            <span className="badge">{formatMoney(revenue, selectedBusiness?.currency ?? workspace.masterAccount.currency)}</span>
          </div>
        );
      })}
    </div>
  );

  const renderBusinesses = () => (
    <div className="list-stack summary-two-column-list">
      {scopedBusinesses.slice(0, 4).map((business) => {
        const units = scopedUnits.filter((unit) => unit.businessId === business.id);
        const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);

        return (
          <div className="list-item" key={business.id}>
            <div>
              <strong>{business.name}</strong>
              <small>{business.type} · {t("roleDashboard.labels.units")}: {units.length}</small>
            </div>
            <span className="badge">{formatMoney(revenue, business.currency)}</span>
          </div>
        );
      })}
    </div>
  );

  const renderPendingCustomers = () => {
    if (scopedPendingPayments.length === 0) {
      return <p className="card-muted">{t("roleDashboard.labels.noPending")}</p>;
    }

    return (
      <div className="pending-payment-report summary-two-column-list">
        {scopedPendingPayments.slice(0, 4).map((payment) => {
          const customer = findCustomer(payment.customerId);
          const business = findBusiness(payment.businessId);
          const unit = findUnit(payment.businessUnitId);

          return (
            <div className="pending-payment-row" key={payment.id}>
              <div className="pending-payment-customer">
                <strong>{customer?.name ?? payment.reference}</strong>
                <small>{unit?.name ?? business?.name ?? t("common.unknownUnit")}</small>
              </div>
              <div className="pending-payment-meta">
                <span>
                  <strong>{t("roleDashboard.labels.lastPayment")}</strong>
                  <small>{formatOptionalDate(payment.lastPaymentAt)}</small>
                </span>
                <span>
                  <strong>{t("roleDashboard.labels.paymentDate")}</strong>
                  <small>{payment.paymentDate ? formatOptionalDate(payment.paymentDate) : t("roleDashboard.labels.noPaymentDate")}</small>
                </span>
              </div>
              <span className="badge warning">{formatMoney(payment.outstandingAmount, business?.currency ?? workspace.masterAccount.currency)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTeam = () => (
    <div className="list-stack summary-two-column-list">
      {scopedTeam.slice(0, 4).map((member) => (
        <div className="list-item" key={member.id}>
          <div>
            <strong>{member.fullName}</strong>
            <small>{member.email} · {t(`roleDashboard.roleNames.${member.roleId}`)}</small>
          </div>
          <span className={member.status === "invited" ? "badge warning" : "badge"}>{t(`common.${member.status}`)}</span>
        </div>
      ))}
    </div>
  );

  const renderProducts = () => {
    if (scopedProducts.length === 0) {
      return <p className="card-muted">{t("roleDashboard.labels.noProducts")}</p>;
    }

    return (
      <div className="list-stack summary-two-column-list">
        {scopedProducts.slice(0, 4).map((product: ProductProfile) => {
          const descriptor = getProductDescriptor(product);

          return (
            <div className="list-item" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <small>{descriptor || t(`categories.${product.category}`)}</small>
                <small>{product.sku ?? t("common.noSku")} · {t(`categories.${product.category}`)}</small>
              </div>
              <span className="badge">{product.timesSold}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDetail = () => {
    switch (activeMetricKey) {
      case "totalRevenue":
      case "businessRevenue":
      case "unitRevenue":
      case "ownSales":
        return renderRevenue();
      case "businesses":
        return renderBusinesses();
      case "units":
      case "queued":
        return renderUnits();
      case "team":
        return renderTeam();
      case "pendingCustomers":
        return renderPendingCustomers();
      case "transactions":
      case "ownTransactions":
        return renderTransactions(scopedTransactions);
      case "products":
        return renderProducts();
      default:
        return <p className="card-muted">{t("roleDashboard.detailFallback")}</p>;
    }
  };

  return (
    <section className="page-grid role-dashboard-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("roleDashboard.eyebrow")}</span>
          <h2>{t("roleDashboard.title")}</h2>
          <DevOnly><p>{t("roleDashboard.description")}</p></DevOnly>
        </div>
        {isCashier && (
          <div className="dashboard-heading-action">
            <Link className="primary-btn" to="/transactions/new">{t("roleDashboard.recordSale")}</Link>
          </div>
        )}
      </div>

      <DevOnly>
        <article className="card role-preview-card">
          <div>
            <span className="eyebrow">{t("roleDashboard.rolePreview")}</span>
            <h3>{t("roleDashboard.viewingAs")}: {selectedMember.fullName}</h3>
            <p className="card-muted">
              {selectedRole ? t(`roleDashboard.roleNames.${selectedRole.id}`) : ""} · {t("roleDashboard.scope")}: {getMemberScopeLabel(selectedMember, t("app.defaultWorkspaceName"))}
            </p>
          </div>
          {isDevEnvironment && isDemoWorkspace() && <span className="badge">{t("app.devAccount")}</span>}
        </article>
      </DevOnly>

      <div className="metrics-grid clean-metrics-grid dashboard-options-grid">
        {metrics.map((metric) => (
          <button key={metric.key} type="button" className={activeMetricKey === metric.key ? "metric-card metric-button active" : "metric-card metric-button"} onClick={() => setSelectedMetric(metric.key)}>
            <span>{t(`roleDashboard.metrics.${metric.key}`)}</span>
            <strong>{metric.value}</strong>
            <small>{t(`roleDashboard.hints.${metric.hintKey}`)}</small>
          </button>
        ))}
      </div>

      <article className="card dashboard-detail-card full-width-detail-card">
        <header>
          <div>
            <span className="eyebrow">{t("roleDashboard.detailHeading")}</span>
            <h3>{t(`roleDashboard.detail.${activeMetricKey}`)}</h3>
            <p className="card-muted">{t("roleDashboard.clickHint")}</p>
          </div>
          <span className="badge">{t(`roleDashboard.metrics.${activeMetricKey}`)}: {activeMetric.value}</span>
        </header>
        {renderDetail()}
        <Link className="secondary-btn full-report-link" to={detailPath}>{t("roleDashboard.openFullReport")}</Link>
      </article>

      <article className="card quick-actions-card quick-actions-below">
        <h3>{t("roleDashboard.quickActions")}</h3>
        <div className="quick-action-list">
          {isCashier && <Link to="/transactions/new">{t("roleDashboard.recordSale")}</Link>}
          {!isCashier && <Link to="/transactions">{t("roleDashboard.openTransactions")}</Link>}
          {(isMasterOwner || isBusinessAdmin) && <Link to="/businesses">{t("roleDashboard.manageBusinesses")}</Link>}
          {(isMasterOwner || isBusinessAdmin) && <Link to="/businesses">{t("roleDashboard.manageTeam")}</Link>}
          {!isCashier && <Link to="/reports">{t("roleDashboard.viewReports")}</Link>}
        </div>
      </article>
    </section>
  );
}
