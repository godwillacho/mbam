import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember } from "../../security/accessControl";
import { getProductRevenueReport, type ProductRevenueRow } from "../../services/productRevenueService";
import type { ProductProfile } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
import { getProductInventorySnapshot } from "../../utils/inventory";
import { getProductSearchText } from "../../utils/productDisplay";
import { canViewDashboardMetric } from "../dashboard/dashboardPermissions";
import "./ProductRevenuePage.css";

const isDevEnvironment = import.meta.env.DEV;
type SortMode = "alphabetical" | "reverse" | "brand" | "bestSelling";

interface ProductDraft {
  name: string;
  sku: string;
  brand: string;
  category: string;
  availableQuantity: string;
  expiryDate: string;
  costPrice: string;
}

function searchTextForRow(row: ProductRevenueRow, product?: ProductProfile): string {
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

function toDraft(product: ProductProfile | undefined, row: ProductRevenueRow): ProductDraft {
  return {
    name: product?.name ?? row.productName,
    sku: product?.sku ?? row.sku,
    brand: product?.brand ?? row.brand ?? "",
    category: product?.category ?? row.category,
    availableQuantity: typeof product?.availableQuantity === "number" ? String(product.availableQuantity) : "",
    expiryDate: product?.expiryDate ?? "",
    costPrice: typeof product?.costPrice === "number" ? String(product.costPrice) : "",
  };
}

function compareText(a: string | undefined, b: string | undefined) {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function sortRows(rows: ProductRevenueRow[], drafts: Record<string, ProductDraft>, sortMode: SortMode): ProductRevenueRow[] {
  return [...rows].sort((a, b) => {
    const draftA = drafts[a.productId];
    const draftB = drafts[b.productId];

    if (sortMode === "bestSelling") return b.pricePoints.length - a.pricePoints.length || b.quantitySold - a.quantitySold;
    if (sortMode === "brand") return compareText(draftA?.brand ?? a.brand, draftB?.brand ?? b.brand) || compareText(draftA?.name ?? a.productName, draftB?.name ?? b.productName);
    if (sortMode === "reverse") return compareText(draftB?.name ?? b.productName, draftA?.name ?? a.productName);
    return compareText(draftA?.name ?? a.productName, draftB?.name ?? b.productName);
  });
}

export default function ProductRevenuePage() {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const [rows, setRows] = useState<ProductRevenueRow[]>([]);
  const [source, setSource] = useState<"api" | "mock">("mock");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [isEditingProducts, setIsEditingProducts] = useState(false);
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    setError(null);

    getProductRevenueReport(member, t("common.noSku"))
      .then((report) => {
        if (ignore) return;
        setRows(report.rows);
        setSource(report.source);
        setProductDrafts((current) => {
          const next = { ...current };
          report.rows.forEach((row) => {
            if (!next[row.productId]) {
              next[row.productId] = toDraft(workspace.products.find((product) => product.id === row.productId), row);
            }
          });
          return next;
        });
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
    const matchedRows = !query ? rows : rows.filter((row) => {
      const product = workspace.products.find((item) => item.id === row.productId);
      const draft = productDrafts[row.productId];
      const draftText = draft ? Object.values(draft).join(" ").toLowerCase() : "";
      return searchTextForRow(row, product).includes(query) || draftText.includes(query);
    });

    return sortRows(matchedRows, productDrafts, sortMode);
  }, [productDrafts, rows, searchQuery, sortMode]);

  const updateDraft = (productId: string, field: keyof ProductDraft, value: string) => {
    const row = rows.find((item) => item.productId === productId);
    if (!row) return;

    setProductDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] ?? toDraft(workspace.products.find((product) => product.id === productId), row)),
        [field]: value,
      },
    }));
  };

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

      {isDevEnvironment && source === "mock" && !isLoading && !error && <div className="product-revenue-source-note">{t("productRevenue.mockSourceNote")}</div>}
      {error && <div className="product-revenue-error">{error}</div>}

      <div className="filter-bar card product-table-controls">
        <div>
          <label htmlFor="product-search">{t("productRevenue.searchLabel")}</label>
          <input id="product-search" type="search" value={searchQuery} placeholder={t("productRevenue.searchPlaceholder")} onChange={(event) => setSearchQuery(event.target.value)} />
          <small>{t("productRevenue.searchHint")}</small>
        </div>
        <div>
          <label htmlFor="product-sort">{t("productRevenue.sortLabel")}</label>
          <select id="product-sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="alphabetical">{t("productRevenue.sortOptions.alphabetical")}</option>
            <option value="reverse">{t("productRevenue.sortOptions.reverse")}</option>
            <option value="brand">{t("productRevenue.sortOptions.brand")}</option>
            <option value="bestSelling">{t("productRevenue.sortOptions.bestSelling")}</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="card-muted">{t("productRevenue.loading")}</p>}
      {!isLoading && filteredRows.length === 0 && !error && <p className="card-muted">{t("productRevenue.noSearchResults")}</p>}

      {!isLoading && filteredRows.length > 0 && (
        <article className="table-card product-management-table-card">
          <header>
            <div>
              <h3>{t("productRevenue.productTable")}</h3>
              <small>{t("transactions.filteredRecords", { count: filteredRows.length })}</small>
            </div>
            <button className={isEditingProducts ? "primary-btn" : "secondary-btn"} type="button" onClick={() => setIsEditingProducts((current) => !current)}>
              {isEditingProducts ? t("productRevenue.doneEditing") : t("productRevenue.editProducts")}
            </button>
          </header>

          <table className="data-table product-management-table">
            <thead>
              <tr>
                <th>{t("productRevenue.product")}</th>
                <th>{t("productRevenue.sku")}</th>
                <th>{t("productRevenue.brand")}</th>
                <th>{t("productRevenue.category")}</th>
                <th>{t("productRevenue.availableQuantity")}</th>
                <th>{t("productRevenue.expiryDate")}</th>
                <th>{t("productRevenue.costPrice")}</th>
                <th>{t("roleDashboard.labels.revenue")}</th>
                <th><button className="table-sort-button" type="button" onClick={() => setSortMode("bestSelling")}>{t("productRevenue.bestSellingProducts")}</button></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const product = workspace.products.find((item) => item.id === row.productId);
                const draft = productDrafts[row.productId] ?? toDraft(product, row);
                const inventory = product ? getProductInventorySnapshot(product) : undefined;
                const transactionCount = row.pricePoints.length;

                return (
                  <tr key={row.productId}>
                    <td>{isEditingProducts ? <input value={draft.name} onChange={(event) => updateDraft(row.productId, "name", event.target.value)} /> : <strong>{draft.name}</strong>}</td>
                    <td>{isEditingProducts ? <input value={draft.sku} onChange={(event) => updateDraft(row.productId, "sku", event.target.value)} /> : draft.sku}</td>
                    <td>{isEditingProducts ? <input value={draft.brand} onChange={(event) => updateDraft(row.productId, "brand", event.target.value)} /> : draft.brand || "—"}</td>
                    <td>{isEditingProducts ? <input value={draft.category} onChange={(event) => updateDraft(row.productId, "category", event.target.value)} /> : t(`categories.${draft.category}`)}</td>
                    <td>{isEditingProducts ? <input type="number" min="0" value={draft.availableQuantity} onChange={(event) => updateDraft(row.productId, "availableQuantity", event.target.value)} /> : inventory?.availableQuantity ?? t("productRevenue.notTracked")}</td>
                    <td>{isEditingProducts ? <input type="date" value={draft.expiryDate} onChange={(event) => updateDraft(row.productId, "expiryDate", event.target.value)} /> : draft.expiryDate || "—"}</td>
                    <td>{isEditingProducts ? <input type="number" min="0" value={draft.costPrice} onChange={(event) => updateDraft(row.productId, "costPrice", event.target.value)} /> : draft.costPrice ? formatMoney(Number(draft.costPrice), workspace.masterAccount.currency) : "—"}</td>
                    <td>{formatMoney(row.totalRevenue, workspace.masterAccount.currency)}</td>
                    <td>
                      <button className="best-selling-cell" type="button" onClick={() => setSortMode("bestSelling")}>
                        <strong>{row.quantitySold}</strong>
                        <small>{t("productRevenue.transactionCount", { count: transactionCount })}</small>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}
