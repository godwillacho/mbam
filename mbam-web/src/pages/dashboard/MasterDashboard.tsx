import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import type { Business, BusinessUnit, TeamMember, TransactionRecord } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";

type DashboardMetricId =
  | "todayRevenue"
  | "transactions"
  | "queued"
  | "team"
  | "pendingCustomers"
  | "products";

type RevenueDrillLevel = "businesses" | "branches" | "workers" | "transactions";

interface DashboardMetric {
  id: DashboardMetricId;
  labelKey: string;
  value: string;
  hintKey: string;
}

interface ChartItem {
  id: string;
  label: string;
  value: number;
  meta?: string;
  onClick?: () => void;
}

interface RevenueDrillState {
  level: RevenueDrillLevel;
  businessId?: string;
  unitId?: string;
  workerName?: string;
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

function sumTransactions(transactions: TransactionRecord[]) {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
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

function getBusinessRevenue(business: Business, transactions: TransactionRecord[]) {
  return sumTransactions(transactions.filter((transaction) => transaction.businessId === business.id));
}

function getUnitRevenue(unit: BusinessUnit, transactions: TransactionRecord[]) {
  return sumTransactions(transactions.filter((transaction) => transaction.businessUnitId === unit.id));
}

function getWorkerRevenue(workerName: string, transactions: TransactionRecord[]) {
  return sumTransactions(transactions.filter((transaction) => transaction.recordedBy === workerName));
}

function MiniBarChart({ items, formatValue }: { items: ChartItem[]; formatValue: (value: number) => string }) {
  const { t } = useTranslation();
  const maxValue = Math.max(...items.map((item) => item.value), 0);

  if (items.length === 0 || maxValue === 0) {
    return <p className="card-muted">{t("roleDashboard.drill.graphEmpty")}</p>;
  }

  return (
    <div className="mini-chart" aria-label={t("roleDashboard.drill.graphTitle")}>
      {items.map((item) => {
        const width = Math.max((item.value / maxValue) * 100, 6);
        return (
          <button
            key={item.id}
            type="button"
            className={item.onClick ? "chart-row clickable" : "chart-row"}
            onClick={item.onClick}
            disabled={!item.onClick}
          >
            <span className="chart-label">{item.label}</span>
            <span className="chart-bar-track">
              <span className="chart-bar" style={{ width: `${width}%` }} />
            </span>
            <strong>{formatValue(item.value)}</strong>
          </button>
        );
      })}
    </div>
  );
}

export default function MasterDashboard() {
  const { t } = useTranslation();
  const [selectedMemberId, setSelectedMemberId] = useState(workspace.teamMembers[0]?.id ?? "");
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricId>("todayRevenue");
  const [revenueDrill, setRevenueDrill] = useState<RevenueDrillState>({ level: "businesses" });

  const selectedMember = workspace.teamMembers.find((member) => member.id === selectedMemberId) ?? workspace.teamMembers[0];
  const role = selectedMember ? getMemberRole(selectedMember) : undefined;

  const scopedUnits = useMemo(() => selectedMember ? getAccessibleUnits(selectedMember) : [], [selectedMember]);
  const scopedTransactions = useMemo(() => selectedMember ? getAccessibleTransactions(selectedMember) : [], [selectedMember]);
  const scopedBusinessIds = new Set(scopedUnits.map((unit) => unit.businessId));
  const scopedRevenue = sumTransactions(scopedTransactions);
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

  const resetRevenueDrill = () => {
    if (selectedMember.roleId === "role-cashier") {
      setRevenueDrill({ level: "transactions", workerName: selectedMember.fullName });
      return;
    }
    if (selectedMember.scopeLevel === "unit") {
      setRevenueDrill({ level: "workers", unitId: selectedMember.businessUnitId });
      return;
    }
    if (selectedMember.scopeLevel === "business") {
      setRevenueDrill({ level: "branches", businessId: selectedMember.businessId });
      return;
    }
    setRevenueDrill({ level: "businesses" });
  };

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
      labelKey: selectedMember.roleId === "role-cashier" ? "roleDashboard.metrics.workers" : "roleDashboard.metrics.team",
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

  const selectedBusiness = revenueDrill.businessId
    ? workspace.businesses.find((business) => business.id === revenueDrill.businessId)
    : undefined;
  const selectedUnit = revenueDrill.unitId
    ? workspace.businessUnits.find((unit) => unit.id === revenueDrill.unitId)
    : undefined;
  const selectedWorkerTransactions = revenueDrill.workerName
    ? scopedTransactions.filter((transaction) => transaction.recordedBy === revenueDrill.workerName)
    : [];

  const businessChartItems: ChartItem[] = workspace.businesses
    .filter((business) => scopedBusinessIds.has(business.id))
    .map((business) => ({
      id: business.id,
      label: business.name,
      value: getBusinessRevenue(business, scopedTransactions),
      meta: business.type,
      onClick: () => setRevenueDrill({ level: "branches", businessId: business.id }),
    }));

  const branchChartItems: ChartItem[] = scopedUnits
    .filter((unit) => !revenueDrill.businessId || unit.businessId === revenueDrill.businessId)
    .map((unit) => ({
      id: unit.id,
      label: unit.name,
      value: getUnitRevenue(unit, scopedTransactions),
      meta: unit.location,
      onClick: () => setRevenueDrill({ level: "workers", businessId: unit.businessId, unitId: unit.id }),
    }));

  const workerNames = Array.from(new Set(
    scopedTransactions
      .filter((transaction) => !revenueDrill.unitId || transaction.businessUnitId === revenueDrill.unitId)
      .map((transaction) => transaction.recordedBy),
  ));

  const workerChartItems: ChartItem[] = workerNames.map((workerName) => ({
    id: workerName,
    label: workerName,
    value: getWorkerRevenue(
      workerName,
      scopedTransactions.filter((transaction) => !revenueDrill.unitId || transaction.businessUnitId === revenueDrill.unitId),
    ),
    meta: t("roleDashboard.labels.worker"),
    onClick: () => setRevenueDrill({
      level: "transactions",
      businessId: revenueDrill.businessId,
      unitId: revenueDrill.unitId,
      workerName,
    }),
  }));

  const goBackRevenueLevel = () => {
    if (revenueDrill.level === "transactions") {
      setRevenueDrill({ level: "workers", businessId: revenueDrill.businessId, unitId: revenueDrill.unitId });
      return;
    }
    if (revenueDrill.level === "workers") {
      if (selectedMember.scopeLevel === "unit") return;
      setRevenueDrill({ level: "branches", businessId: revenueDrill.businessId });
      return;
    }
    if (revenueDrill.level === "branches") {
      if (selectedMember.scopeLevel === "business") return;
      setRevenueDrill({ level: "businesses" });
    }
  };

  const revenueTitleKey = revenueDrill.level === "businesses"
    ? "roleDashboard.drill.businessLevel"
    : revenueDrill.level === "branches"
      ? "roleDashboard.drill.branchLevel"
      : revenueDrill.level === "workers"
        ? "roleDashboard.drill.workerLevel"
        : "roleDashboard.drill.transactionLevel";

  const revenueHelpKey = revenueDrill.level === "businesses"
    ? "roleDashboard.drill.clickBusiness"
    : revenueDrill.level === "branches"
      ? "roleDashboard.drill.clickBranch"
      : revenueDrill.level === "workers"
        ? "roleDashboard.drill.clickWorker"
        : selectedMember.roleId === "role-cashier"
          ? "roleDashboard.drill.cashierList"
          : "roleDashboard.drill.transactionLevel";

  const canGoBack = revenueDrill.level === "transactions"
    || (revenueDrill.level === "workers" && selectedMember.scopeLevel !== "unit")
    || (revenueDrill.level === "branches" && selectedMember.scopeLevel === "master");

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
        <select
          value={selectedMemberId}
          onChange={(event) => {
            setSelectedMemberId(event.target.value);
            setSelectedMetric("todayRevenue");
            setRevenueDrill({ level: "businesses" });
          }}
        >
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
            onClick={() => {
              setSelectedMetric(metric.id);
              if (metric.id === "todayRevenue") resetRevenueDrill();
            }}
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
            <h3>{selectedMetric === "todayRevenue" ? t(revenueTitleKey) : t(`roleDashboard.detail.${selectedMetricConfig.id}`)}</h3>
            <p className="card-muted">{selectedMetric === "todayRevenue" ? t(revenueHelpKey) : t(selectedMetricConfig.hintKey)}</p>
          </div>
          <span className="badge">{t(selectedMetricConfig.labelKey)}: {selectedMetricConfig.value}</span>
        </header>

        {selectedMetric === "todayRevenue" && (
          <div className="drilldown-panel">
            <div className="drill-breadcrumbs">
              <button type="button" onClick={resetRevenueDrill}>{t("roleDashboard.drill.overview")}</button>
              {selectedBusiness && <span>/ {selectedBusiness.name}</span>}
              {selectedUnit && <span>/ {selectedUnit.name}</span>}
              {revenueDrill.workerName && <span>/ {revenueDrill.workerName}</span>}
              {canGoBack && <button type="button" className="secondary-btn" onClick={goBackRevenueLevel}>{t("roleDashboard.back")}</button>}
            </div>

            <section className="chart-card">
              <h4>{t("roleDashboard.drill.graphTitle")}</h4>
              {revenueDrill.level === "businesses" && (
                <MiniBarChart items={businessChartItems} formatValue={(value) => formatMoney(value, workspace.masterAccount.currency)} />
              )}
              {revenueDrill.level === "branches" && (
                <MiniBarChart items={branchChartItems} formatValue={(value) => formatMoney(value, workspace.masterAccount.currency)} />
              )}
              {revenueDrill.level === "workers" && (
                <MiniBarChart items={workerChartItems} formatValue={(value) => formatMoney(value, workspace.masterAccount.currency)} />
              )}
              {revenueDrill.level === "transactions" && (
                <MiniBarChart
                  items={selectedWorkerTransactions.map((transaction) => ({
                    id: transaction.id,
                    label: transaction.reference,
                    value: transaction.amount,
                    meta: transaction.customerName,
                  }))}
                  formatValue={(value) => formatMoney(value, workspace.masterAccount.currency)}
                />
              )}
            </section>

            <div className="list-stack">
              {revenueDrill.level === "businesses" && businessChartItems.map((item) => (
                <button key={item.id} type="button" className="list-item list-button" onClick={item.onClick}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.meta} · {t("roleDashboard.drill.clickBusiness")}</small>
                  </div>
                  <span className="badge">{formatMoney(item.value, workspace.masterAccount.currency)}</span>
                </button>
              ))}

              {revenueDrill.level === "branches" && branchChartItems.map((item) => (
                <button key={item.id} type="button" className="list-item list-button" onClick={item.onClick}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.meta} · {t("roleDashboard.drill.clickBranch")}</small>
                  </div>
                  <span className="badge">{formatMoney(item.value, workspace.masterAccount.currency)}</span>
                </button>
              ))}

              {revenueDrill.level === "workers" && workerChartItems.map((item) => (
                <button key={item.id} type="button" className="list-item list-button" onClick={item.onClick}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{t("roleDashboard.labels.salesCount", {
                      count: scopedTransactions.filter((transaction) => transaction.recordedBy === item.label && (!revenueDrill.unitId || transaction.businessUnitId === revenueDrill.unitId)).length,
                    })}</small>
                  </div>
                  <span className="badge">{formatMoney(item.value, workspace.masterAccount.currency)}</span>
                </button>
              ))}
              {revenueDrill.level === "workers" && workerChartItems.length === 0 && <p className="card-muted">{t("roleDashboard.labels.noWorkers")}</p>}

              {revenueDrill.level === "transactions" && (
                selectedWorkerTransactions.length === 0 ? <p className="card-muted">{t("roleDashboard.labels.noRecords")}</p> : selectedWorkerTransactions.map((transaction) => (
                  <div className="list-item" key={transaction.id}>
                    <div>
                      <strong>{transaction.reference} · {transaction.customerName}</strong>
                      <small>{t("paymentMethods." + transaction.paymentMethod)} · {t("common." + transaction.status)}</small>
                    </div>
                    <span className="badge">{formatMoney(transaction.amount, workspace.masterAccount.currency)}</span>
                  </div>
                ))
              )}
            </div>
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
