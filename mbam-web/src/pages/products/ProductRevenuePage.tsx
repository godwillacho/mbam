import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember } from "../../security/accessControl";
import { getProductRevenueReport, type ProductRevenuePricePoint, type ProductRevenueRow } from "../../services/productRevenueService";
import { formatMoney } from "../../utils/formatters";
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

function groupBy<T>(items: T[], getKey: (item: T) => string): Array<{ key: string; items: T[] }> {
  return Array.from(items.reduce<Map<string, T[]>>((map, item) => {
    const key = getKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
    return map;
  }, new Map()).entries()).map(([key, groupedItems]) => ({ key, items: groupedItems }));
}

function sumRevenue(items: ProductRevenuePricePoint[]): number {
  return items.reduce((sum, item) => sum + item.total, 0);
}

function sumQuantity(items: ProductRevenuePricePoint[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export default function ProductRevenuePage() {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const [rows, setRows] = useState<ProductRevenueRow[]>([]);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    setError(null);

    getProductRevenueReport(member, t("common.noSku"))
      .then((report) => {
        if (ignore) return;
        setRows(report.rows);
        setSource(report.source);
        setSelectedProductId((current) => current ?? report.rows[0]?.productId ?? null);
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

  const topRows = filteredRows.slice(0, 4);
  const selectedRow = filteredRows.find((row) => row.productId === selectedProductId) ?? filteredRows[0];
  const selectedProduct = selectedRow ? workspace.products.find((item) => item.id === selectedRow.productId) : undefined;
  const inventory = selectedProduct ? getProductInventorySnapshot(selectedProduct) : undefined;
  const branchGroups = selectedRow ? groupBy(selectedRow.pricePoints, (point) => point.unitName) : [];
  const employeeGroups = selectedRow ? groupBy(selectedRow.pricePoints, (point) => point.recordedBy) : [];
  const customerGroups = selectedRow ? groupBy(selectedRow.pricePoints, (point) => point.customerName) : [];

  if (!canViewDashboardMetric(member, "products")) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <section className="page-grid product-revenue-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("productRevenue.eyebrow")}</span>
          <h2>{t("productRevenue.title")}</h2>
          <p>{t("productRevenue.description")}</p>
        </div>
      </div>

      {source === "mock" && !isLoading && !error && <div className="product-revenue-source-note">{t("productRevenue.mockSourceNote")}</div>}
      {error && <div className="product-revenue-error">{error}</div>}

      <div className="filter-bar card">
        <label htmlFor="product-search">{t("productRevenue.searchLabel")}</label>
        <input id="product-search" type="search" value={searchQuery} placeholder={t("productRevenue.searchPlaceholder")} onChange={(event) => setSearchQuery(event.target.value)} />
        <small>{t("productRevenue.searchHint")}</small>
      </div>

      {isLoading && <p className="card-muted">{t("productRevenue.loading")}</p>}
      {!isLoading && filteredRows.length === 0 && !error && <p className="card-muted">{t("productRevenue.noSearchResults")}</p>}

      {!isLoading && topRows.length > 0 && (
        <div className="metrics-grid clean-metrics-grid">
          {topRows.map((row) => (
            <button key={row.productId} className={selectedRow?.productId === row.productId ? "metric-card metric-button active" : "metric-card metric-button"} type="button" onClick={() => setSelectedProductId(row.productId)}>
              <span>{row.productName}</span>
              <strong>{formatMoney(row.totalRevenue, workspace.masterAccount.currency)}</strong>
              <small>{row.descriptor || row.sku}</small>
            </button>
          ))}
        </div>
      )}

      {selectedRow && (
        <article className="card product-revenue-card">
          <header>
            <div>
              <span className="eyebrow">{t("productRevenue.selectedProduct")}</span>
              <h3>{selectedRow.productName}</h3>
              <small>{selectedRow.descriptor || selectedRow.sku}</small>
            </div>
            <span className="badge warning">{formatMoney(selectedRow.totalRevenue, workspace.masterAccount.currency)}</span>
          </header>

          <div className="metrics-grid clean-metrics-grid">
            <article className="metric-card"><span>{t("productRevenue.quantitySold")}</span><strong>{selectedRow.quantitySold}</strong><small>{selectedRow.sku}</small></article>
            <article className="metric-card"><span>{t("productRevenue.avgUnitPrice")}</span><strong>{formatMoney(selectedRow.averageUnitPrice, workspace.masterAccount.currency)}</strong><small>{t("productRevenue.unitPrice")}</small></article>
            <article className="metric-card"><span>{t("productRevenue.availableQuantity")}</span><strong>{inventory?.availableQuantity ?? t("productRevenue.notTracked")}</strong><small>{inventory ? t(`productRevenue.stockStatus.${inventory.status}`) : t("productRevenue.notTracked")}</small></article>
            <article className="metric-card"><span>{t("productRevenue.costPrice")}</span><strong>{selectedProduct?.costPrice ? formatMoney(selectedProduct.costPrice, workspace.masterAccount.currency) : "—"}</strong><small>{selectedProduct?.expiryDate ? `${t("productRevenue.expiryDate")}: ${selectedProduct.expiryDate}` : selectedRow.businessName}</small></article>
          </div>

          <div className="card-grid two" style={{ marginTop: 18 }}>
            <article className="card">
              <h3>{t("productRevenue.branchBreakdown")}</h3>
              <div className="list-stack">
                {branchGroups.map((group) => (
                  <div className="list-item" key={group.key}>
                    <div><strong>{group.key}</strong><small>{t("productRevenue.quantity")}: {sumQuantity(group.items)}</small></div>
                    <span className="badge">{formatMoney(sumRevenue(group.items), workspace.masterAccount.currency)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <h3>{t("productRevenue.employeeBreakdown")}</h3>
              <div className="list-stack">
                {employeeGroups.map((group) => (
                  <div className="list-item" key={group.key}>
                    <div><strong>{group.key}</strong><small>{t("productRevenue.quantity")}: {sumQuantity(group.items)}</small></div>
                    <span className="badge">{formatMoney(sumRevenue(group.items), workspace.masterAccount.currency)}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="card" style={{ marginTop: 18 }}>
            <h3>{t("productRevenue.customerBreakdown")}</h3>
            <div className="list-stack">
              {customerGroups.map((group) => (
                <div className="list-item" key={group.key}>
                  <div><strong>{group.key}</strong><small>{t("productRevenue.quantity")}: {sumQuantity(group.items)}</small></div>
                  <span className="badge">{formatMoney(sumRevenue(group.items), workspace.masterAccount.currency)}</span>
                </div>
              ))}
            </div>
          </article>
        </article>
      )}
    </section>
  );
}
