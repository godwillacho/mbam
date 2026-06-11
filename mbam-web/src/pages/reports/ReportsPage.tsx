import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { formatMoney } from "../../utils/formatters";

export default function ReportsPage() {
  const { t } = useTranslation();
  const completed = workspace.transactions.filter((transaction) => transaction.status === "completed");
  const completedRevenue = completed.reduce((sum, transaction) => sum + transaction.amount, 0);
  const queued = workspace.transactions.filter((transaction) => transaction.status === "queued");

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("reports.eyebrow")}</span>
          <h2>{t("reports.title")}</h2>
          <p>{t("reports.description")}</p>
        </div>
        <Link className="secondary-btn" to="/dashboard">{t("pendingPayments.backToDashboard")}</Link>
      </div>

      <div className="metrics-grid">
        <article className="metric-card">
          <span>{t("reports.completedRevenue")}</span>
          <strong>{formatMoney(completedRevenue, workspace.masterAccount.currency)}</strong>
          <small>{t("reports.completedRecords", { count: completed.length })}</small>
        </article>
        <article className="metric-card">
          <span>{t("reports.queuedAmount")}</span>
          <strong>{formatMoney(queued.reduce((sum, transaction) => sum + transaction.amount, 0), workspace.masterAccount.currency)}</strong>
          <small>{t("reports.waitingForSync", { count: queued.length })}</small>
        </article>
        <article className="metric-card">
          <span>{t("reports.averageSale")}</span>
          <strong>{formatMoney(completedRevenue / Math.max(completed.length, 1), workspace.masterAccount.currency)}</strong>
          <small>{t("reports.completedOnly")}</small>
        </article>
        <article className="metric-card">
          <span>{t("reports.activeUnits")}</span>
          <strong>{workspace.businessUnits.length}</strong>
          <small>{t("reports.acrossBusinesses")}</small>
        </article>
      </div>

      <article className="card">
        <h3>{t("reports.nextSections")}</h3>
        <div className="list-stack">
          <div className="list-item"><strong>{t("reports.revenueByBusiness")}</strong><span className="badge">{t("common.planned")}</span></div>
          <div className="list-item"><strong>{t("reports.revenueByUnit")}</strong><span className="badge">{t("common.planned")}</span></div>
          <div className="list-item"><strong>{t("reports.workerPerformance")}</strong><span className="badge">{t("common.planned")}</span></div>
          <div className="list-item"><strong>{t("reports.offlineSyncHealth")}</strong><span className="badge warning">{t("common.important")}</span></div>
        </div>
      </article>
    </section>
  );
}
