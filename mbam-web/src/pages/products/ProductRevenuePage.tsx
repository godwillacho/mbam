import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember } from "../../security/accessControl";
import { getProductRevenueReport, type ProductRevenueRow } from "../../services/productRevenueService";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { getProductInventorySnapshot } from "../../utils/inventory";
import { getProductSearchText } from "../../utils/productDisplay";
import { canViewDashboardMetric } from "../dashboard/dashboardPermissions";
import "./ProductRevenuePage.css";

function searchTextForRow(row: ProductRevenueRow): string {
  const product = workspace.products.find((item) => item.id === row.productId);

  return [
    row.productName,
    row.sku,
    row.category,
    row.businessName,
    row.descriptor,
    row.manufacturer,
    row.brand,
    row.variant,
    row.packageSize,
    row.unitOfMeasure,
    row.barcode,
    product ? getProductSearchText(product) : undefined,
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function ProductRevenuePage() {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const [rows, setRows] = useState<ProductRevenueRow[]>([]);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => searchTextForRow(row).includes(query));
  }, [rows, searchQuery]);

  if (!canViewDashboardMetric(member, "products")) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalRevenue = filteredRows.reduce((sum, row) => sum + row.totalRevenue, 0);
  const totalQuantity = filteredRows.reduce((sum, row) => sum + row.quantitySold, 0);

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

      <div className="filter-bar card">
        <label htmlFor="product-search">{t("productRevenue.searchLabel")}</label>
        <input
          id="product-search"
          type="search"
          value={searchQuery}
          placeholder={t("productRevenue.searchPlaceholder")}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <small>{t("productRevenue.searchHint")}</small>
      </div>

      <div className="metrics-grid clean-metrics-grid">
        <article className="metric-card">
          <span>{t("productRevenue.totalRevenue")}</span>
          <strong>{isLoading ? "…" : formatMoney(totalRevenue, workspace.masterAccount.currency)}</strong>
          <small>{t("productRevenue.totalRevenueHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.productsSold")}</span>
          <strong>{isLoading ? "…" : filteredRows.length}</strong>
          <small>{t("productRevenue.productsSoldHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.quantitySold")}</span>
          <strong>{isLoading ? "…" : totalQuantity}</strong>
          <small>{t("productRevenue.quantitySoldHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.topProduct")}</span>
          <strong>{isLoading ? "…" : filteredRows[0]?.productName ?? "—"}</strong>
          <small>{filteredRows[0]?.descriptor || t("productRevenue.topProductHint")}</small>
        </article>
      </div>

      <article className="card product-revenue-card">
        <header>
          <span className="eyebrow">{t("productRevenue.fullReport")}</span>
          <h3>{t("productRevenue.trendingProducts")}</h3>
          <small>{t("transactions.filteredRecords", { count: filteredRows.length })}</small>
        </header>

        {isLoading && <p className="card-muted">{t("productRevenue.loading")}</p>}

        {!isLoading && filteredRows.length === 0 && !error && (
          <p className="card-muted">{t("productRevenue.noSearchResults")}</p>
        )}

        {!isLoading && filteredRows.length > 0 && (
          <div className="product-revenue-list">
            {filteredRows.map((row) => {
              const product = workspace.products.find((item) => item.id === row.productId);
              const inventory = product ? getProductInventorySnapshot(product) : undefined;

              return (
                <article className="product-revenue-row" key={row.productId}>
                  <div className="product-revenue-summary">
                    <div>
                      <strong>{row.productName}</strong>
                      <small>{row.descriptor || `${row.businessName} · ${t(`categories.${row.category}`)}`}</small>
                      <small>{row.businessName} · {t(`categories.${row.category}`)} · {row.sku}</small>
                      {row.barcode && <small>{t("productRevenue.barcode")}: {row.barcode}</small>}
                      {product?.expiryDate && <small>{t("productRevenue.expiryDate")}: {formatDateTime(product.expiryDate)}</small>}
                    </div>
                    <div className="product-revenue-stats">
                      <span className="badge warning">{formatMoney(row.totalRevenue, workspace.masterAccount.currency)}</span>
                      <span className="badge">{t("productRevenue.quantity")}: {row.quantitySold}</span>
                      <span className="badge">{t("productRevenue.avgUnitPrice")}: {formatMoney(row.averageUnitPrice, workspace.masterAccount.currency)}</span>
                      {typeof product?.costPrice === "number" && <span className="badge">{t("productRevenue.costPrice")}: {formatMoney(product.costPrice, workspace.masterAccount.currency)}</span>}
                      {inventory && <span className={inventory.status === "low" || inventory.status === "out" || inventory.status === "expired" ? "badge warning" : "badge"}>{t("productRevenue.availableQuantity")}: {inventory.availableQuantity ?? t("productRevenue.notTracked")}</span>}
                      {inventory && <span className={inventory.status === "available" ? "badge" : "badge warning"}>{t(`productRevenue.stockStatus.${inventory.status}`)}</span>}
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
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
