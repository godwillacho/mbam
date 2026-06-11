import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedUnits } from "../../security/accessControl";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { canViewDashboardMetric } from "../dashboard/dashboardPermissions";
import "./ProductRevenuePage.css";

interface ProductRevenueRow {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  businessName: string;
  quantitySold: number;
  totalRevenue: number;
  averageUnitPrice: number;
  latestSoldAt?: string;
  pricePoints: Array<{
    id: string;
    customerName: string;
    unitName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    soldAt: string;
    recordedBy: string;
  }>;
}

function businessName(id: string): string {
  return workspace.businesses.find((business) => business.id === id)?.name ?? "—";
}

function unitName(id: string): string {
  return workspace.businessUnits.find((unit) => unit.id === id)?.name ?? "—";
}

export default function ProductRevenuePage() {
  const { t } = useTranslation();
  const member = getCurrentMember();

  if (!canViewDashboardMetric(member, "products")) {
    return <Navigate to="/dashboard" replace />;
  }

  const scopedUnits = getScopedUnits(member);
  const scopedUnitIds = new Set(scopedUnits.map((unit) => unit.id));
  const visibleSales = productSales.filter((sale) => scopedUnitIds.has(sale.businessUnitId));
  const scopedSales = member.roleId === "role-cashier"
    ? visibleSales.filter((sale) => sale.recordedBy === member.fullName)
    : visibleSales;

  const rows = Array.from(scopedSales.reduce<Map<string, ProductRevenueRow>>((map, sale) => {
    const product = workspace.products.find((item) => item.id === sale.productId);
    if (!product) return map;

    const existing = map.get(sale.productId) ?? {
      productId: sale.productId,
      productName: product.name,
      sku: product.sku ?? t("common.noSku"),
      category: product.category,
      businessName: businessName(sale.businessId),
      quantitySold: 0,
      totalRevenue: 0,
      averageUnitPrice: 0,
      latestSoldAt: undefined,
      pricePoints: [],
    };

    const lineTotal = sale.quantity * sale.unitPrice;
    existing.quantitySold += sale.quantity;
    existing.totalRevenue += lineTotal;
    existing.averageUnitPrice = existing.totalRevenue / Math.max(existing.quantitySold, 1);
    existing.latestSoldAt = !existing.latestSoldAt || sale.soldAt > existing.latestSoldAt ? sale.soldAt : existing.latestSoldAt;
    existing.pricePoints.push({
      id: sale.id,
      customerName: sale.customerName,
      unitName: unitName(sale.businessUnitId),
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      total: lineTotal,
      soldAt: sale.soldAt,
      recordedBy: sale.recordedBy,
    });

    map.set(sale.productId, existing);
    return map;
  }, new Map()).values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

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
        <Link className="secondary-btn" to="/dashboard">{t("pendingPayments.backToDashboard")}</Link>
      </div>

      <div className="metrics-grid clean-metrics-grid">
        <article className="metric-card">
          <span>{t("productRevenue.totalRevenue")}</span>
          <strong>{formatMoney(totalRevenue, workspace.masterAccount.currency)}</strong>
          <small>{t("productRevenue.totalRevenueHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.productsSold")}</span>
          <strong>{rows.length}</strong>
          <small>{t("productRevenue.productsSoldHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.quantitySold")}</span>
          <strong>{totalQuantity}</strong>
          <small>{t("productRevenue.quantitySoldHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("productRevenue.topProduct")}</span>
          <strong>{rows[0]?.productName ?? "—"}</strong>
          <small>{t("productRevenue.topProductHint")}</small>
        </article>
      </div>

      <article className="card product-revenue-card">
        <header>
          <span className="eyebrow">{t("productRevenue.fullReport")}</span>
          <h3>{t("productRevenue.trendingProducts")}</h3>
        </header>

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
      </article>
    </section>
  );
}
