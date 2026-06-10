import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import type { Business, BusinessUnit, CustomerProfile, ProductProfile, TeamMember, TransactionRecord } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./MasterDashboard.css";

type DashboardMetricKey =
  | "totalRevenue"
  | "businesses"
  | "units"
  | "queued"
  | "team"
  | "pendingCustomers"
  | "businessRevenue"
  | "unitRevenue"
  | "transactions"
  | "ownSales"
  | "ownTransactions"
  | "products";

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

function sumTransactions(records: TransactionRecord[]): number {
  return records.reduce((sum, record) => sum + record.amount, 0);
}

function sumPending(customers: CustomerProfile[]): number {
  return customers.reduce((sum, customer) => sum + customer.pendingBalance, 0);
}

function formatOptionalDate(value?: string): string {
  return value ? formatDateTime(value) : "—";
}

function getMemberScopeLabel(member: TeamMember): string {
  const unit = findUnit(member.businessUnitId);
  const business = findBusiness(member.businessId ?? unit?.businessId);

  if (unit && business) return `${business.name} / ${unit.name}`;
  if (business) return business.name;
  return workspace.masterAccount.name;
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
  const transactions = workspace.transactions.filter((transaction) => unitIds.has(transaction.businessUnitId));

  if (member.roleId === "role-cashier") {
    return transactions.filter((transaction) => transaction.recordedBy === member.fullName);
  }

  return transactions;
}

export default function MasterDashboard() {
  const { t } = useTranslation();
  const [selectedMemberId, setSelectedMemberId] = useState(workspace.teamMembers[0]?.id ?? "");
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricKey | null>(null);

  const selectedMember = workspace.teamMembers.find((member) => member.id === selectedMemberId) ?? workspace.teamMembers[0];
  const selectedRole = workspace.roles.find((role) => role.id === selectedMember.roleId);
  const isCashier = selectedMember.roleId === "role-cashier";
  const isMasterOwner = selectedMember.scopeLevel === "master";
  const isBusinessAdmin = selectedMember.scopeLevel === "business";
  const selectedUnit = findUnit(selectedMember.businessUnitId);
  const selectedBusiness = findBusiness(selectedMember.businessId ?? selectedUnit?.businessId);

  const scopedUnits = useMemo(() => getScopedUnits(selectedMember), [selectedMember]);
  const scopedTransactions = useMemo(() => getScopedTransactions(selectedMember, scopedUnits), [selectedMember, scopedUnits]);
  const scopedBusinessIds = new Set(scopedUnits.map((unit) => unit.businessId));
  const scopedBusinesses = workspace.businesses.filter((business) => scopedBusinessIds.has(business.id));
  const scopedCustomers = workspace.customers.filter((customer) => !customer.businessId || scopedBusinessIds.has(customer.businessId));
  const pendingCustomers = scopedCustomers.filter((customer) => customer.pendingBalance > 0);
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

  const metrics = useMemo<DashboardMetric[]>(() => {
    if (isCashier) {
      return [
        { key: "ownSales", value: formatMoney(displayedRevenue, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "ownActivity" },
        { key: "ownTransactions", value: scopedTransactions.length, hintKey: "ownActivity" },
        { key: "queued", value: queuedTransactions, hintKey: "offlineSync" },
        { key: "unitRevenue", value: formatMoney(unitRevenue, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "assignedScope" },
      ];
    }

    if (isMasterOwner) {
      return [
        { key: "totalRevenue", value: formatMoney(displayedRevenue, workspace.masterAccount.currency), hintKey: "allUnits" },
        { key: "businesses", value: scopedBusinesses.length, hintKey: "masterBusinesses" },
        { key: "units", value: scopedUnits.length, hintKey: "allUnits" },
        { key: "queued", value: queuedTransactions, hintKey: "offlineSync" },
        { key: "team", value: scopedTeam.length, hintKey: "activeTeam" },
        { key: "pendingCustomers", value: formatMoney(sumPending(pendingCustomers), workspace.masterAccount.currency), hintKey: "pendingFollowUp" },
      ];
    }

    return [
      { key: isBusinessAdmin ? "businessRevenue" : "unitRevenue", value: formatMoney(displayedRevenue, selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "assignedScope" },
      { key: "transactions", value: scopedTransactions.length, hintKey: "assignedScope" },
      { key: "queued", value: queuedTransactions, hintKey: "offlineSync" },
      { key: "pendingCustomers", value: formatMoney(sumPending(pendingCustomers), selectedBusiness?.currency ?? workspace.masterAccount.currency), hintKey: "pendingFollowUp" },
      { key: "products", value: scopedProducts.length, hintKey: "assignedScope" },
    ];
  }, [displayedRevenue, isBusinessAdmin, isCashier, isMasterOwner, pendingCustomers, queuedTransactions, scopedBusinesses.length, scopedProducts.length, scopedTeam.length, scopedTransactions.length, scopedUnits.length, selectedBusiness, unitRevenue]);

  const activeMetric = metrics.find((metric) => metric.key === selectedMetric) ?? metrics[0];
  const activeMetricKey = activeMetric.key;

  const renderTransactions = (records: TransactionRecord[]) => {
    if (records.length === 0) {
      return <p className="card-muted">{t("roleDashboard.labels.noRecords")}</p>;
    }

    return (
      <div className="list-stack">
        {records.map((transaction) => (
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
    <div className="list-stack">
      {scopedUnits.map((unit) => (
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
    <div className="list-stack">
      {scopedUnits.map((unit) => {
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
    <div className="list-stack">
      {scopedBusinesses.map((business) => {
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
    if (pendingCustomers.length === 0) {
      return <p className="card-muted">{t("roleDashboard.labels.noPending")}</p>;
    }

    return (
      <div className="pending-payment-report">
        {pendingCustomers.map((customer) => (
          <div className="pending-payment-row" key={customer.id}>
            <div className="pending-payment-customer">
              <strong>{customer.name}</strong>
              <small>{customer.contact ?? t("transactionRecord.noContactSaved")}</small>
            </div>
            <div className="pending-payment-meta">
              <span>
                <strong>{t("roleDashboard.labels.lastPayment")}</strong>
                <small>{formatOptionalDate(customer.lastPaymentAt)}</small>
              </span>
              <span>
                <strong>{t("roleDashboard.labels.paymentDate")}</strong>
                <small>{customer.paymentDate ? formatOptionalDate(customer.paymentDate) : t("roleDashboard.labels.noPaymentDate")}</small>
              </span>
            </div>
            <span className="badge warning">{formatMoney(customer.pendingBalance, selectedBusiness?.currency ?? workspace.masterAccount.currency)}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderTeam = () => (
    <div className="list-stack">
      {scopedTeam.map((member) => (
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
      <div className="list-stack">
        {scopedProducts.map((product: ProductProfile) => (
          <div className="list-item" key={product.id}>
            <div>
              <strong>{product.name}</strong>
              <small>{t(`categories.${product.category}`)} · {product.sku ?? t("common.noSku")}</small>
            </div>
            <span className="badge">{product.timesSold}</span>
          </div>
        ))}
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
          <p>{t("roleDashboard.description")}</p>
        </div>
        {isCashier && (
          <div className="dashboard-heading-action">
            <Link className="primary-btn" to="/transactions/new">{t("roleDashboard.recordSale")}</Link>
          </div>
        )}
      </div>

      <article className="card role-preview-card">
        <div>
          <span className="eyebrow">{t("roleDashboard.rolePreview")}</span>
          <h3>{t("roleDashboard.viewingAs")}: {selectedMember.fullName}</h3>
          <p className="card-muted">
            {selectedRole ? t(`roleDashboard.roleNames.${selectedRole.id}`) : ""} · {t("roleDashboard.scope")}: {getMemberScopeLabel(selectedMember)}
          </p>
        </div>
        <select
          value={selectedMemberId}
          onChange={(event) => {
            setSelectedMemberId(event.target.value);
            setSelectedMetric(null);
          }}
        >
          {workspace.teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName} — {t(`roles.${member.roleId}`)}
            </option>
          ))}
        </select>
      </article>

      <div className="metrics-grid clean-metrics-grid">
        {metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={activeMetricKey === metric.key ? "metric-card metric-button active" : "metric-card metric-button"}
            onClick={() => setSelectedMetric(metric.key)}
          >
            <span>{t(`roleDashboard.metrics.${metric.key}`)}</span>
            <strong>{metric.value}</strong>
            <small>{t(`roleDashboard.hints.${metric.hintKey}`)}</small>
          </button>
        ))}
      </div>

      <div className="card-grid two clean-dashboard-grid">
        <article className="card dashboard-detail-card">
          <header>
            <div>
              <span className="eyebrow">{t("roleDashboard.detailHeading")}</span>
              <h3>{t(`roleDashboard.detail.${activeMetricKey}`)}</h3>
              <p className="card-muted">{t("roleDashboard.clickHint")}</p>
            </div>
            <span className="badge">{t(`roleDashboard.metrics.${activeMetricKey}`)}: {activeMetric.value}</span>
          </header>
          {renderDetail()}
        </article>

        <article className="card quick-actions-card">
          <h3>{t("roleDashboard.quickActions")}</h3>
          <div className="quick-action-list">
            {isCashier && <Link to="/transactions/new">{t("roleDashboard.recordSale")}</Link>}
            <Link to="/transactions">{t("roleDashboard.openTransactions")}</Link>
            {(isMasterOwner || isBusinessAdmin) && <Link to="/businesses">{t("roleDashboard.manageBusinesses")}</Link>}
            {isMasterOwner && <Link to="/team">{t("roleDashboard.manageTeam")}</Link>}
            {!isCashier && <Link to="/reports">{t("roleDashboard.viewReports")}</Link>}
          </div>
        </article>
      </div>
    </section>
  );
}
