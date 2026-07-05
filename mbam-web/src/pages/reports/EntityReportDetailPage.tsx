import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import TimeframeControl, { type CustomRange } from "../../components/charts/TimeframeControl";
import PrintButton from "../../components/app/PrintButton";
import { workspace } from "../../data/mockWorkspace";
import { loadEntityItems, type EntityItem } from "../../services/entityDirectoryService";
import {
  loadReport,
  type ReportDimension,
  type ReportSeries,
  type ReportTimeframe,
} from "../../services/reportService";
import { logger } from "../../services/logging/logger";
import { formatMoney } from "../../utils/formatters";
import "./ScopedEntityReportPage.css";

// Live demo/test traffic (see mbam-api's dev_demo_data.rs) keeps inserting
// new transactions in the background, so poll for a fresh chart
// periodically instead of only fetching once per timeframe change.
const CHART_POLL_INTERVAL_MS = 30_000;

// This page only ever routes to shops/employees/products (see
// listPathByKind below); "businesses" is a valid EntityKind for the shared
// directory service and the Detail-view entity picker, but has no
// dedicated per-entity page of its own.
export type EntityKind = "shops" | "employees" | "products";

const listPathByKind: Record<EntityKind, string> = {
  shops: "/shops",
  employees: "/employees",
  products: "/products",
};

function reportFilters(
  kind: EntityKind,
  selected: string,
  timeframe: ReportTimeframe,
  customRange: CustomRange,
) {
  return {
    timeframe,
    ...(timeframe === "custom"
      ? { startDate: customRange.start, endDate: customRange.end }
      : {}),
    ...(kind === "shops" ? { businessUnitId: selected } : {}),
    ...(kind === "employees" ? { employeeId: selected } : {}),
    ...(kind === "products" ? { productId: selected } : {}),
  };
}

export default function EntityReportDetailPage({ kind }: { kind: EntityKind }) {
  const { t } = useTranslation();
  const { entityId } = useParams();
  const [items, setItems] = useState<EntityItem[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [timeframe, setTimeframe] = useState<ReportTimeframe>("daily");
  const [customRange, setCustomRange] = useState<CustomRange>({ start: "", end: "" });
  const isCustomRangeValid =
    timeframe !== "custom" ||
    (customRange.start !== "" && customRange.end !== "" && customRange.end >= customRange.start);
  const [series, setSeries] = useState<ReportSeries | null>(null);
  const [chartState, setChartState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const currency = workspace.businesses[0]?.currency ?? "XAF";
  const dimension = kind as ReportDimension;
  const listPath = listPathByKind[kind];

  useEffect(() => {
    let ignore = false;
    setListState("loading");
    loadEntityItems(kind)
      .then((nextItems) => {
        if (ignore) return;
        setItems(nextItems);
        setListState("ready");
      })
      .catch(() => {
        if (ignore) return;
        setItems([]);
        setListState("error");
      });
    return () => {
      ignore = true;
    };
  }, [kind]);

  useEffect(() => {
    if (!entityId || !isCustomRangeValid) return;
    let ignore = false;

    const fetchSeries = (isInitialLoad: boolean) => {
      if (isInitialLoad) {
        setSeries(null);
        setChartState("loading");
      }
      return loadReport(dimension, reportFilters(kind, entityId, timeframe, customRange))
        .then((report) => {
          if (ignore) return;
          setSeries(report.series.find((item) => item.entity_id === entityId) ?? null);
          setChartState("ready");
        })
        .catch((error: unknown) => {
          if (ignore) return;
          if (isInitialLoad) {
            setSeries(null);
            setChartState("error");
          } else {
            // A background refresh failed (e.g. a transient network blip).
            // Keep showing the last good chart instead of replacing it
            // with an error state.
            logger.debug("Background entity report refresh failed; keeping last known data", {
              error,
            });
          }
        });
    };

    void fetchSeries(true);
    const intervalId = window.setInterval(() => {
      void fetchSeries(false);
    }, CHART_POLL_INTERVAL_MS);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, [dimension, entityId, kind, timeframe, customRange, isCustomRangeValid]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === entityId),
    [items, entityId],
  );

  if (!entityId) return <Navigate to={listPath} replace />;

  const isOutOfScope = listState === "error" || chartState === "error";

  return (
    <section className="page-grid">
      <div className="page-heading scoped-entity-heading">
        <div>
          <h2>{selectedItem?.name ?? t("scopedEntityReport.loadingEntity")}</h2>
          {selectedItem?.description && (
            <p className="card-muted">{selectedItem.description}</p>
          )}
        </div>
        <div className="dashboard-heading-action entity-detail-heading-actions no-print">
          <Link className="secondary-btn" to={listPath}>
            {t(`scopedEntityReport.detailBackTo.${kind}`)}
          </Link>
          <PrintButton label={t("scopedEntityReport.printReport")} />
        </div>
      </div>

      <article className="card scoped-chart-panel entity-detail-chart-panel">
        <header>
          <div>
            <span className="eyebrow">{timeframe}</span>
            <h3>{selectedItem?.name ?? t("scopedEntityReport.loadingEntity")}</h3>
          </div>
          <div className="entity-detail-chart-actions">
            <div className="no-print">
              <TimeframeControl
                customRange={customRange}
                onChange={setTimeframe}
                onCustomRangeChange={setCustomRange}
                value={timeframe}
              />
            </div>
            {series && (
              <div className="scoped-chart-total">
                <strong>
                  {kind === "products"
                    ? t("scopedEntityReport.unitsSold", { count: series.total_quantity })
                    : formatMoney(series.total_revenue, currency)}
                </strong>
                <small>{formatMoney(series.total_revenue, currency)}</small>
              </div>
            )}
          </div>
        </header>
        {isOutOfScope && (
          <p className="validation-summary" role="alert">
            {t("scopedEntityReport.outOfScope")}
          </p>
        )}
        {!isOutOfScope && !isCustomRangeValid && (
          <p className="card-muted">{t("reportsPage.customRangePending")}</p>
        )}
        {!isOutOfScope && isCustomRangeValid && chartState === "loading" && (
          <p role="status">{t("scopedEntityReport.loadingChart")}</p>
        )}
        {!isOutOfScope && isCustomRangeValid && chartState === "ready" && !series && (
          <p className="card-muted">{t("scopedEntityReport.noSalesForTimeframe")}</p>
        )}
        {!isOutOfScope && isCustomRangeValid && chartState === "ready" && series && (
          <AuthorizedLineChart
            label={series.entity_name}
            points={series.points}
            quantity={kind === "products"}
            valueFormatter={kind === "products"
              ? (value) => t("scopedEntityReport.unitsSold", { count: Math.round(value) })
              : (value) => formatMoney(value, currency)}
          />
        )}
      </article>
    </section>
  );
}
