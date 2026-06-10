import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import type { BusinessUnit, TeamMember, TransactionRecord } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";

type DashboardMetricId =
  | "todayRevenue"
  | "transactions"
  | "queued"
  | "team"
  | "pendingCustomers"
  | "products";

interface DashboardMetric {
  id: DashboardMetricId;
  labelKey: string;
  value: string;
  hintKey: string;
}

function getMemberRole(member: TeamMember) {
  return workspace.roles.find((role) => role.id === member.roleId);
}

function getAccessibleUnits(member: TeamMember): BusinessUnit[] {
  if (member.scopeLevel === "master") return workspace.businessUnits;
  if (member.scopeLevel === "business" && member.businessId) {
    return workspace.businessUnits.filter((unit) => unit.businessId === member.businessId);
  }
  if (member.scopeLevel === "unit" && member.businessUnitId) {
    return workspace.businessUnits.filter((unit) => unit.id === member.businessUnitId);
  }
  return [];
}

function getAccessibleTransactions(member: TeamMember): TransactionRecord[] {
  const accessibleUnitIds = new Set(getAccessibleUnits(member).map((unit) => unit.id));
  const scopedTransactions = workspace.transactions.filter((transaction) => accessibleUnitIds.has(transaction.businessUnitId));

  if (member.roleId === "role-cashier") {
    return scopedTransactions.filter((transaction) => transaction.recordedBy === member.fullName);
  }

  return scopedTransactions;
}

function getRevenueLabelKey(member: TeamMember) {
  if (member.scopeLevel === "master") return "roleDashboard.metrics.totalRevenue";
  if (member.scopeLevel === "business") return "roleDashboard.metrics.businessRevenue";
  if (member.roleId === "role-cashier") return "roleDashboard.metrics.ownSales";
  return "roleDashboard.metrics.unitRevenue";
}

function getRevenueHintKey(member: TeamMember) {
  if (member.roleId === "role-cashier") return "roleDashboard.hints.ownActivity";
  if (member.scopeLevel === "master") return "roleDashboard.hints.allUnits";
  return "roleDashboard.hints.assignedScope";
}

export default function MasterDashboard() {
  const { t } = useTranslation();
  const [selectedMemberId, setSelectedMemberId] = useState(workspace.teamMembers[0]?.id ?? "");
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricId>("todayRevenue");

  const selectedMember = workspace.teamMembers.find((member) => member.id === selectedMemberId) ?? workspace.teamMembers[0];
  const role = selectedMember ? getMemberRole(selectedMember) : undefined;

  const scopedUnits = useMemo(() => selectedMember ? getAccessibleUnits(selectedMember) : [], [selectedMember]);
  const scopedTransactions = useMemo(() => selectedMember ? getAccessibleTransactions(selectedMember) : [], [selectedMember]);
  const scopedBusinessIds = new Set(scopedUnits.map((unit) => unit.businessId));
  const scopedRevenue = scopedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const scopedQueued = scopedUnits.reduce((sum, unit) => sum + unit.queuedTransactions, 0);
  const scopedTeam = workspace.teamMembers.filter((member) => {
    if (!selectedMember) return false;
    if (selectedMember.scopeLevel === "master") return true;
    if (selectedMember.scopeLevel === "business") return member.businessId === selectedMember.businessId;
    return member.businessUnitId === selectedMember.businessUnitId || member.id === selectedMember.id;
  });
  const scopedPendingCustomers = workspace.customers.filter((customer) => {
    if (customer.pendingBalance <= 0) return false;
    if (selectedMember?.scopeLevel === "master") return true;
    return customer.businessId ? scopedBusinessIds.has(customer.businessId) : false;
  });
  const scopedProducts = workspace.products.filter((product) => {
    if (selectedMember?.scopeLevel === "master") return true;
    return product.businessId ? scopedBusinessIds.has(product.businessId) : false;
  });

  const metrics: DashboardMetric[] = [
    {
      id: "todayRevenue",
      labelKey: getRevenueLabelKey(selectedMember),
      value: formatMoney(scopedRevenue, workspace.masterAccount.currency),
      hintKey: getRevenueHintKey(selectedMember),
    },
    {
      id: "transactions",
      labelKey: selectedMember?.roleId === "role-cashier" ? "roleDashboard.metrics.ownTransactions" : "roleDashboard.metrics.transactions",
      value: String(scopedTransactions.length),
      hintKey: selectedMember?.roleId === "role-cashier" ? "roleDashboard.hints.ownActivity" : "roleDashboard.hints.assignedScope",
    },
    {
      id: "queued",
      labelKey: "roleDashboard.metrics.queued",
      value: String(scopedQueued),
      hintKey: "roleDashboard.hints.offlineSync",
    },
    {
      id: "pendingCustomers",
      labelKey: "roleDashboard.metrics.pendingCustomers",
      value: String(scopedPendingCustomers.length),
      hintKey: "roleDashboard.hints.pendingFollowUp",
    },
    {
      id: "team",
      labelKey: "roleDashboard.metrics.team",
      value: String(scopedTeam.length),
      hintKey: "roleDashboard.hints.activeTeam",
    },
    {
      id: "products",
      labelKey: "roleDashboard.metrics.products",
      value: String(scopedProducts.length),
      hintKey: "roleDashboard.hints.assignedScope",
    },
  ];

  const selectedMetricConfig = metrics.find((metric) => metric.id === selectedMetric) ?? metrics[0];

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("roleDashboard.eyebrow")}</span>
          <h2>{t("roleDashboard.title")}</h2>
          <p>{t("roleDashboard.description")}</p>
        </div>
        <Link className="primary-btn" to="/transactions/new">{t("roleDashboard.recordSale")}</Link>
      </div>

      <article className="card role-preview-card">
        <div>
          <span className="eyebrow">{t("roleDashboard.rolePreview")}</span>
          <h3>{t("roleDashboard.viewingAs")}: {selectedMember?.fullName}</h3>
          <p className="card-muted">
            {role ? t(`roleDashboard.roleNames.${role.id}`) : t("common.unknownRole")} · {selectedMember ? t(`roleDashboard.scopeLabels.${selectedMember.scopeLevel}`) : ""}
          </p>
        </div>
        <select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)}>
          {workspace.teamMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName} — {t(`roles.${member.roleId}`)}
            </option>
          ))}
        </select>
      </article>

      <div className="metrics-grid">
        {metrics.map((metric) => (
          <button
            key={metric.id}
            type="button"
            className={selectedMetric === metric.id ? "metric-card metric-button active" : "metric-card metric-button"}
            onClick={() => setSelectedMetric(metric.id)}
          >
            <span>{t(metric.labelKey)}</span>
            <strong>{metric.value}</strong>
            <small>{t(metric.hintKey)}</small>
          </button>
        ))}
      </div>

      <article className="card dashboard-detail-card">
        <header>
          <div>
            <span className="eyebrow">{t("roleDashboard.detailHeading")}</span>
            <h3>{t(`roleDashboard.detail.${selectedMetricConfig.id}`)}</h3>
            <p className="card-muted">{t(selectedMetricConfig.hintKey)}</p>
          </div>
          <span className="badge">{t(selectedMetricConfig.labelKey)}: {selectedMetricConfig.value}</span>
        </header>

        {selectedMetric === "todayRevenue" && (
          <div className="list-stack">
            {scopedUnits.map((unit) => {
              const unitTransactions = scopedTransactions.filter((transaction) => transaction.businessUnitId === unit.id);
              const unitRevenue = unitTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
              return (
                <div className="list-item" key={unit.id}>
                  <div>
                    <strong>{unit.name}</strong>
                    <small>{unit.location} · {unitTransactions.length} {t("roleDashboard.metrics.transactions")}</small>
                  </div>
                  <span className="badge">{formatMoney(unitRevenue, workspace.masterAccount.currency)}</span>
                </div>
              );
            })}
          </div>
        )}

        {selectedMetric === "transactions" && (
          <div className="list-stack">
            {scopedTransactions.length === 0 && <p className="card-muted">{t("roleDashboard.labels.noRecords")}</p>}
            {scopedTransactions.map((transaction) => (
              <div className="list-item" key={transaction.id}>
                <div>
                  <strong>{transaction.reference} · {transaction.customerName}</strong>
                  <small>{t("roleDashboard.labels.recordedBy")}: {transaction.recordedBy}</small>
                </div>
                <span className="badge">{formatMoney(transaction.amount, workspace.masterAccount.currency)}</span>
              </div>
            ))}
          </div>
        )}

        {selectedMetric === "queued" && (
          <div className="list-stack">
            {scopedUnits.map((unit) => (
              <div className="list-item" key={unit.id}>
                <div>
                  <strong>{unit.name}</strong>
                  <small>{unit.location}</small>
                </div>
                <span className={unit.queuedTransactions > 0 ? "badge warning" : "badge"}>{unit.queuedTransactions}</span>
              </div>
            ))}
          </div>
        )}

        {selectedMetric === "pendingCustomers" && (
          <div className="list-stack">
            {scopedPendingCustomers.length === 0 && <p className="card-muted">{t("roleDashboard.labels.noPending")}</p>}
            {scopedPendingCustomers.map((customer) => (
              <div className="list-item" key={customer.id}>
                <div>
                  <strong>{customer.name}</strong>
                  <small>{customer.contact ?? t("transactionRecord.noContactSaved")}</small>
                </div>
                <span className="badge warning">{formatMoney(customer.pendingBalance, workspace.masterAccount.currency)}</span>
              </div>
            ))}
          </div>
        )}

        {selectedMetric === "team" && (
          <div className="list-stack">
            {scopedTeam.map((member) => (
              <div className="list-item" key={member.id}>
                <div>
                  <strong>{member.fullName}</strong>
                  <small>{member.email} · {t(`roles.${member.roleId}`)}</small>
                </div>
                <span className={member.status === "invited" ? "badge warning" : "badge"}>{t(`common.${member.status}`)}</span>
              </div>
            ))}
          </div>
        )}

        {selectedMetric === "products" && (
          <div className="list-stack">
            {scopedProducts.length === 0 && <p className="card-muted">{t("roleDashboard.labels.noProducts")}</p>}
            {scopedProducts.map((product) => (
              <div className="list-item" key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <small>{t(`categories.${product.category}`)} · {product.sku ?? t("common.noSku")}</small>
                </div>
                <span className="badge">{product.timesSold}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
