import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PrintButton from "../../components/app/PrintButton";
import {
  loadReportTransactionDetail,
  type ReportDetailFilters,
  type ReportDetailResponse,
} from "../../services/reports/reportService";
import { logger } from "../../services/logging/logger";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./ReportDetailTable.css";

// Live demo/test traffic (see mbam-api's dev_demo_data.rs) keeps inserting
// new transactions in the background, so poll for fresh detail rows
// periodically instead of only fetching once per filter change.
const DETAIL_POLL_INTERVAL_MS = 30_000;

interface ReportDetailTableProps {
  filters: ReportDetailFilters;
  currency: string;
}

/**
 * Printable, audit-grade table of individual transaction lines. Reads from
 * `GET /api/v1/reports/transactions`, which mbam-api restricts to Master
 * Owner and Business Admin (see reports::service::transaction_detail) —
 * this component is only ever mounted for those roles (see the
 * Summary/Detail toggle in ReportsPage.tsx), so a 403 here would indicate a
 * role-gating bug rather than an expected state.
 */
export default function ReportDetailTable({ filters, currency }: ReportDetailTableProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Joined once here (rather than inline in the effect's dependency array)
  // so each dependency is a plain variable react-hooks/exhaustive-deps can
  // statically check, not a `.join(",")` call expression.
  const businessIdsKey = filters.businessIds?.join(",");
  const businessUnitIdsKey = filters.businessUnitIds?.join(",");
  const employeeIdsKey = filters.employeeIds?.join(",");
  const productIdsKey = filters.productIds?.join(",");

  useEffect(() => {
    let ignore = false;

    const fetchDetail = (isInitialLoad: boolean) => {
      if (isInitialLoad) setState("loading");
      return loadReportTransactionDetail(filters)
        .then((next) => {
          if (ignore) return;
          setDetail(next);
          setState("ready");
        })
        .catch((error: unknown) => {
          if (ignore) return;
          if (isInitialLoad) {
            setDetail(null);
            setState("error");
          } else {
            // A background refresh failed (e.g. a transient network blip).
            // Keep showing the last good table instead of replacing it with
            // an error state.
            logger.debug("Background report detail refresh failed; keeping last known data", {
              error,
            });
          }
        });
    };

    void fetchDetail(true);
    const intervalId = window.setInterval(() => {
      void fetchDetail(false);
    }, DETAIL_POLL_INTERVAL_MS);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
    // Depend on joined strings rather than the array references themselves
    // (`businessIds` etc. are rebuilt on every ReportsPage render even when
    // unchanged) so this effect only re-fetches when the actual filter
    // values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.timeframe,
    filters.startDate,
    filters.endDate,
    filters.timezone,
    businessIdsKey,
    businessUnitIdsKey,
    employeeIdsKey,
    productIdsKey,
  ]);

  if (state === "loading") {
    return (
      <article className="card report-state" role="status">
        {t("reportsPage.detailTable.loading")}
      </article>
    );
  }

  if (state === "error") {
    return (
      <div className="validation-summary" role="alert">
        {t("reportsPage.detailTable.error")}
      </div>
    );
  }

  if (!detail || detail.rows.length === 0) {
    return (
      <article className="card report-state">
        {t("reportsPage.detailTable.empty")}
      </article>
    );
  }

  return (
    <article className="card report-detail-card">
      <header className="report-detail-header">
        <div>
          <span className="eyebrow">{t("reportsPage.detailTable.title")}</span>
          <p className="card-muted">{t("reportsPage.detailTable.hint")}</p>
        </div>
        <PrintButton label={t("reportsPage.printReport")} className="primary-btn no-print" />
      </header>
      {detail.truncated && (
        <p className="report-detail-truncated" role="alert">
          {t("reportsPage.detailTable.truncatedWarning", { count: detail.rows.length })}
        </p>
      )}
      <div className="report-detail-table-wrap">
        <table className="data-table report-detail-table">
          <thead>
            <tr>
              <th>{t("reportsPage.detailTable.columns.dateTime")}</th>
              <th>{t("reportsPage.detailTable.columns.transaction")}</th>
              <th>{t("reportsPage.detailTable.columns.business")}</th>
              <th>{t("reportsPage.detailTable.columns.shop")}</th>
              <th>{t("reportsPage.detailTable.columns.customer")}</th>
              <th>{t("reportsPage.detailTable.columns.product")}</th>
              <th>{t("reportsPage.detailTable.columns.sku")}</th>
              <th>{t("reportsPage.detailTable.columns.quantity")}</th>
              <th>{t("reportsPage.detailTable.columns.unitPrice")}</th>
              <th>{t("reportsPage.detailTable.columns.lineTotal")}</th>
              <th>{t("reportsPage.detailTable.columns.paymentMethod")}</th>
              <th>{t("reportsPage.detailTable.columns.status")}</th>
              <th>{t("reportsPage.detailTable.columns.recordedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {detail.rows.map((row) => (
              <tr key={row.line_id}>
                <td>{formatDateTime(row.created_at)}</td>
                <td>{row.transaction_id.slice(0, 8).toUpperCase()}</td>
                <td>{row.business_name}</td>
                <td>{row.business_unit_name ?? "—"}</td>
                <td>{row.customer_name}</td>
                <td>{row.product_name}</td>
                <td>{row.sku ?? "—"}</td>
                <td>{row.quantity.toLocaleString()}</td>
                <td>{formatMoney(row.unit_price, currency)}</td>
                <td>{formatMoney(row.line_total, currency)}</td>
                <td>{row.payment_method}</td>
                <td>{row.status}</td>
                <td>{row.recorded_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
