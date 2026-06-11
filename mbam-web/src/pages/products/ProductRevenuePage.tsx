import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember } from "../../security/accessControl";
import { getProductRevenueReport, type ProductRevenueRow } from "../../services/productRevenueService";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { canViewDashboardMetric } from "../dashboard/dashboardPermissions";
import "./ProductRevenuePage.css";

export default function ProductRevenuePage() {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const [rows, setRows] = useState<ProductRevenueRow[]>([]);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    setIsLoading(true);
    setError(null);

    getProductRevenueReport(member, t("common.noSku"))
      .then((report) => {
        if (ignore) return;
        setRows(report.rows);
        setSource(report.source);
      })
      .catch((reportError: unknown) => {
        if (ignore) return;
        setRows([]);
        setError(reportError instanceof Error ? reportError.message : t("productRevenue.loadError"));
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [member.id, t]);

  if (!canViewDashboardMetric(member, "products")) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantitySold, 0);

  return (
    <section className="page-grid product-revenue-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("productRevenue.eyebrow")}</span>
          <h2>{t("productRevenue.title")}</h2>
          <p>{t("productRevenue.description")}</p>
        </div>
      </div>

      {source === "mock" && !isLoading && !error && (
        <div className="product-revenue-source-note">
          {t("productRevenue.mockSourceNote")}
        </div>
      )}

      {error && <div className="product-revenue-error">{error}</div>}

      <div className="metrics-grid clean-metrics-grid">
        <article className="metric-card">
          <span>{t("productRevenue.totalRevenue")}</span>
          <strong>{isLoading ? "…" : formatMoney(totalRevenue, workspace.masterAccount.currency)}</strong>
          <small>{t("productRevenue.totalRevenueHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.productsSold")}</span>
          <strong>{isLoading ? "…" : rows.length}</strong>
          <small>{t("productRevenue.productsSoldHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.quantitySold")}</span>
          <strong>{isLoading ? "…" : totalQuantity}</strong>
          <small>{t("productRevenue.quantitySoldHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.topProduct")}</span>
          <strong>{isLoading ? "…" : rows[0]?.productName ?? "—"}</strong>
          <small>{t("productRevenue.topProductHint")}</small>
        </article>
      </div>

      <article className="card product-revenue-card">
        <header>
          <span className="eyebrow">{t("productRevenue.fullReport")}</span>
          <h3>{t("productRevenue.trendingProducts")}</h3>
        </header>

        {isLoading && <p className="card-muted">{t("productRevenue.loading")}</p>}

        {!isLoading && rows.length === 0 && !error && (
          <p className="card-muted">{t("roleDashboard.labels.noProducts")}</p>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="product-revenue-list">
            {rows.map((row) => (
              <article className="product-revenue-row" key={row.productId}>
                <div className="product-revenue-summary">
                  <div>
                    <strong>{row.productName}</strong>
                    <small>{row.businessName} · {t(`categories.${row.category}`)} · {row.sku}</small>
                  </div>
                  <div className="product-revenue-stats">
                    <span className="badge warning">{formatMoney(row.totalRevenue, workspace.masterAccount.currency)}</span>
                    <span className="badge">{t("productRevenue.quantity")}: {row.quantitySold}</span>
                    <span className="badge">{t("productRevenue.avgUnitPrice")}: {formatMoney(row.averageUnitPrice, workspace.masterAccount.currency)}</span>
                  </div>
                </div>

                <div className="product-price-grid">
                  {row.pricePoints.map((price) => (
                    <div className="product-price-row" key={price.id}>
                      <div>
                        <strong>{price.customerName}</strong>
                        <small>{price.unitName} · {t("roleDashboard.labels.recordedBy")}: {price.recordedBy}</small>
                      </div>
                      <div>
                        <span>{t("productRevenue.unitPrice")}: {formatMoney(price.unitPrice, workspace.masterAccount.currency)}</span>
                        <span>{t("productRevenue.quantity")}: {price.quantity}</span>
                        <span>{t("roleDashboard.labels.revenue")}: {formatMoney(price.total, workspace.masterAccount.currency)}</span>
                        <small>{formatDateTime(price.soldAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
