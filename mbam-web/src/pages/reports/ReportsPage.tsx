import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import AuthorizedPieChart from "../../components/charts/AuthorizedPieChart";
import TimeframeControl from "../../components/charts/TimeframeControl";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember } from "../../security/accessControl";
import {
  loadReport,
  type ReportDimension,
  type ReportResponse,
  type ReportTimeframe,
} from "../../services/reportService";
import { formatMoney } from "../../utils/formatters";
import "./ReportsPage.css";

const labels: Record<ReportDimension, string> = {
  businesses: "Businesses",
  shops: "Shops",
  employees: "Employees",
  products: "Products",
};

function baseline(roleId: string): string {
  if (roleId.includes("master-owner")) return "master_owner";
  if (roleId.includes("business-admin")) return "business_admin";
  if (roleId.includes("shop-manager")) return "shop_manager";
  return "cashier";
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const role = baseline(member.roleId);
  const dimensions = useMemo<ReportDimension[]>(
    () =>
      role === "master_owner" || role === "business_admin"
        ? ["businesses", "shops", "employees", "products"]
        : role === "shop_manager"
          ? ["shops", "employees", "products"]
          : ["employees", "products"],
    [role],
  );
  const [dimension, setDimension] = useState<ReportDimension>(dimensions[0]);
  const [timeframe, setTimeframe] = useState<ReportTimeframe>("daily");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const currency = workspace.businesses[0]?.currency ?? "XAF";
  const isQuantityDimension = dimension === "products";
  const distributionValueFormatter = useMemo(
    () => (isQuantityDimension
      ? (value: number) => t("reportsPage.unitsSold", { count: Math.round(value) })
      : (value: number) => formatMoney(value, currency)),
    [currency, isQuantityDimension, t],
  );
  const distributionData = useMemo(
    () => (report?.series ?? []).map((series) => ({
      id: series.entity_id,
      name: series.entity_name,
      value: isQuantityDimension ? series.total_quantity : series.total_revenue,
    })),
    [report, isQuantityDimension],
  );

  useEffect(() => {
    let ignore = false;
    setReport(null);
    setState("loading");
    loadReport(dimension, { timeframe })
      .then((next) => {
        if (ignore) return;
        setReport(next);
        setState("ready");
      })
      .catch(() => {
        if (ignore) return;
        setReport(null);
        setState("error");
      });
    return () => {
      ignore = true;
    };
  }, [dimension, timeframe]);

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">Authorized reporting</span>
          <h2>Reports</h2>
          <p className="card-muted">
            Aggregated by the API using only your current business, shop, and
            ownership scope.
          </p>
        </div>
        <TimeframeControl onChange={setTimeframe} value={timeframe} />
      </div>

      <div className="report-dimension-tabs" role="tablist" aria-label="Report type">
        {dimensions.map((item) => (
          <button
            aria-selected={dimension === item}
            className={dimension === item ? "active" : ""}
            key={item}
            onClick={() => setDimension(item)}
            role="tab"
            type="button"
          >
            {labels[item]}
          </button>
        ))}
      </div>

      {state === "loading" && (
        <article className="card report-state" role="status">
          Loading authorized report…
        </article>
      )}
      {state === "error" && (
        <div className="validation-summary" role="alert">
          The report could not be loaded. No cached broader data is displayed.
        </div>
      )}
      {state === "ready" && report?.series.length === 0 && (
        <article className="card report-state">
          No sales were recorded in this authorized scope and timeframe.
        </article>
      )}
      {state === "ready" && report && report.series.length > 1 && (
        <article className="card report-distribution-card">
          <header>
            <div>
              <span className="eyebrow">{t("reportsPage.distributionEyebrow")}</span>
              <h3>{t(`reportsPage.distributionTitle.${dimension}`)}</h3>
              <p className="card-muted">{t("reportsPage.distributionHint")}</p>
            </div>
          </header>
          <AuthorizedPieChart
            ariaLabel={t(`reportsPage.distributionTitle.${dimension}`)}
            data={distributionData}
            emptyLabel={t("reportsPage.distributionEmpty")}
            valueFormatter={distributionValueFormatter}
          />
        </article>
      )}
      {state === "ready" && report && report.series.length > 0 && (
        <div className="report-series-grid">
          {report.series.map((series) => (
            <article className="card report-series-card" key={series.entity_id}>
              <header>
                <div>
                  <span className="eyebrow">{labels[dimension]}</span>
                  <h3>{series.entity_name}</h3>
                </div>
                <div className="report-total">
                  <strong>
                    {dimension === "products"
                      ? `${series.total_quantity.toLocaleString()} sold`
                      : formatMoney(series.total_revenue, currency)}
                  </strong>
                  <small>
                    {series.transaction_count.toLocaleString()} transactions
                  </small>
                </div>
              </header>
              <AuthorizedLineChart
                label={series.entity_name}
                points={series.points}
                quantity={dimension === "products"}
                valueFormatter={distributionValueFormatter}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
