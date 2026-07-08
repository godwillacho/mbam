import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import AuthorizedPieChart from "../../components/charts/AuthorizedPieChart";
import TimeframeControl, { type CustomRange } from "../../components/charts/TimeframeControl";
import PrintButton from "../../components/app/PrintButton";
import EntityMultiSelect from "../../components/reports/EntityMultiSelect";
import ReportDetailTable from "./ReportDetailTable";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember } from "../../routing/accessControl";
import {
  loadReport,
  type ReportDetailFilters,
  type ReportDimension,
  type ReportFilters,
  type ReportResponse,
  type ReportTimeframe,
} from "../../services/reports/reportService";
import { logger } from "../../services/logging/logger";
import { formatMoney } from "../../utils/formatters";
import "./ReportsPage.css";

// Live demo/test traffic (see mbam-api's dev/demo_data.rs) keeps inserting
// new transactions in the background, so poll for fresh report data
// periodically instead of only fetching once per dimension/timeframe change.
const REPORT_POLL_INTERVAL_MS = 30_000;

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
  const [customRange, setCustomRange] = useState<CustomRange>({ start: "", end: "" });
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const isCustomRangeValid =
    timeframe !== "custom" ||
    (customRange.start !== "" && customRange.end !== "" && customRange.end >= customRange.start);
  // Master Owner and Business Admin can drop into the raw, printable
  // transaction/line-item table; mbam-api's reports::service::transaction_detail
  // enforces the same gate server-side, so this is purely which view to
  // offer -- not the source of truth for access.
  const canViewDetail = role === "master_owner" || role === "business_admin";
  const [view, setView] = useState<"summary" | "detail">("summary");
  const reportFilters = useMemo<ReportFilters>(
    () => ({
      timeframe,
      ...(timeframe === "custom"
        ? { startDate: customRange.start, endDate: customRange.end }
        : {}),
    }),
    [timeframe, customRange.start, customRange.end],
  );
  // One selection list per dimension, so switching tabs in Detail view
  // (Businesses/Shops/Employees/Products) does not clear a different
  // dimension's already-built group -- only the active tab's picker and
  // filter are shown/applied at a time.
  const [selectedIdsByDimension, setSelectedIdsByDimension] = useState<
    Record<ReportDimension, string[]>
  >({ businesses: [], shops: [], employees: [], products: [] });
  const selectedEntityIds = selectedIdsByDimension[dimension];
  const detailFilters = useMemo<ReportDetailFilters>(
    () => ({
      timeframe,
      ...(timeframe === "custom"
        ? { startDate: customRange.start, endDate: customRange.end }
        : {}),
      ...(dimension === "businesses" ? { businessIds: selectedEntityIds } : {}),
      ...(dimension === "shops" ? { businessUnitIds: selectedEntityIds } : {}),
      ...(dimension === "employees" ? { employeeIds: selectedEntityIds } : {}),
      ...(dimension === "products" ? { productIds: selectedEntityIds } : {}),
    }),
    [timeframe, customRange.start, customRange.end, dimension, selectedEntityIds],
  );
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
    // Skip fetching the aggregate chart data while the Detail view is
    // active (it fetches its own data) or while a custom range is still
    // incomplete/inverted -- there is nothing valid to request yet.
    if (view !== "summary" || !isCustomRangeValid) {
      return;
    }

    let ignore = false;

    const fetchReport = (isInitialLoad: boolean) => {
      if (isInitialLoad) {
        setReport(null);
        setState("loading");
      }
      return loadReport(dimension, reportFilters)
        .then((next) => {
          if (ignore) return;
          setReport(next);
          setState("ready");
        })
        .catch((error: unknown) => {
          if (ignore) return;
          if (isInitialLoad) {
            setReport(null);
            setState("error");
          } else {
            // A background refresh failed (e.g. a transient network blip).
            // Keep showing the last good report instead of replacing it
            // with an error state.
            logger.debug("Background report refresh failed; keeping last known data", {
              error,
            });
          }
        });
    };

    void fetchReport(true);
    const intervalId = window.setInterval(() => {
      void fetchReport(false);
    }, REPORT_POLL_INTERVAL_MS);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, [dimension, reportFilters, view, isCustomRangeValid]);

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
        <div className="dashboard-heading-action report-heading-actions no-print">
          {canViewDetail && (
            <div className="report-view-toggle" role="group" aria-label="Report detail level">
              <button
                aria-pressed={view === "summary"}
                className={view === "summary" ? "active" : ""}
                onClick={() => setView("summary")}
                type="button"
              >
                {t("reportsPage.detailToggle.summary")}
              </button>
              <button
                aria-pressed={view === "detail"}
                className={view === "detail" ? "active" : ""}
                onClick={() => setView("detail")}
                type="button"
              >
                {t("reportsPage.detailToggle.detail")}
              </button>
            </div>
          )}
          <TimeframeControl
            customRange={customRange}
            onChange={setTimeframe}
            onCustomRangeChange={setCustomRange}
            value={timeframe}
          />
          {view === "summary" && <PrintButton label={t("reportsPage.printReport")} />}
        </div>
      </div>

      <div className="report-dimension-tabs no-print" role="tablist" aria-label="Report type">
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

      {view === "detail" && (
        <div className="report-entity-picker no-print">
          <EntityMultiSelect
            kind={dimension}
            onChange={(ids) =>
              setSelectedIdsByDimension((previous) => ({ ...previous, [dimension]: ids }))
            }
            selectedIds={selectedEntityIds}
          />
        </div>
      )}

      {view === "detail" && (
        isCustomRangeValid ? (
          <ReportDetailTable currency={currency} filters={detailFilters} />
        ) : (
          <article className="card report-state">{t("reportsPage.customRangePending")}</article>
        )
      )}

      {view === "summary" && state === "loading" && (
        <article className="card report-state" role="status">
          Loading authorized report…
        </article>
      )}
      {view === "summary" && state === "error" && (
        <div className="validation-summary" role="alert">
          The report could not be loaded. No cached broader data is displayed.
        </div>
      )}
      {view === "summary" && state === "ready" && report?.series.length === 0 && (
        <article className="card report-state">
          No sales were recorded in this authorized scope and timeframe.
        </article>
      )}
      {view === "summary" && state === "ready" && report && report.series.length > 1 && (
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
      {view === "summary" && state === "ready" && report && report.series.length > 0 && (
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
