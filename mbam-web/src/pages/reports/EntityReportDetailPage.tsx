import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import TimeframeControl from "../../components/charts/TimeframeControl";
import { workspace } from "../../data/mockWorkspace";
import { loadAuthorizationBootstrap } from "../../services/authorizationService";
import { listAuthorizedProductsOnline } from "../../services/productService";
import {
  loadReport,
  type ReportDimension,
  type ReportSeries,
  type ReportTimeframe,
} from "../../services/reportService";
import { loadTeamWorkspace } from "../../services/teamService";
import { formatMoney } from "../../utils/formatters";
import "./ScopedEntityReportPage.css";

export type EntityKind = "shops" | "employees" | "products";

interface EntityItem {
  id: string;
  name: string;
  description: string;
}

const listPathByKind: Record<EntityKind, string> = {
  shops: "/shops",
  employees: "/employees",
  products: "/products",
};

async function loadItems(kind: EntityKind): Promise<EntityItem[]> {
  if (kind === "shops") {
    const bootstrap = await loadAuthorizationBootstrap();
    return bootstrap.business_units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      description:
        bootstrap.businesses.find((business) => business.id === unit.business_id)
          ?.name ?? "",
    }));
  }
  if (kind === "employees") {
    const team = await loadTeamWorkspace();
    return team.members.map((member) => ({
      id: member.user_id,
      name: member.full_name,
      description: member.role_name,
    }));
  }
  return (await listAuthorizedProductsOnline()).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.sku ?? product.category,
  }));
}

function reportFilters(
  kind: EntityKind,
  selected: string,
  timeframe: ReportTimeframe,
) {
  return {
    timeframe,
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
    loadItems(kind)
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
    if (!entityId) return;
    let ignore = false;
    setSeries(null);
    setChartState("loading");
    loadReport(dimension, reportFilters(kind, entityId, timeframe))
      .then((report) => {
        if (ignore) return;
        setSeries(report.series.find((item) => item.entity_id === entityId) ?? null);
        setChartState("ready");
      })
      .catch(() => {
        if (ignore) return;
        setSeries(null);
        setChartState("error");
      });
    return () => {
      ignore = true;
    };
  }, [dimension, entityId, kind, timeframe]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === entityId),
    [items, entityId],
  );

  if (!entityId) return <Navigate to={listPath} replace />;

  const isOutOfScope = listState === "error" || chartState === "error";

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t(`scopedEntityReport.detailEyebrow.${kind}`)}</span>
          <h2>{selectedItem?.name ?? t("scopedEntityReport.loadingEntity")}</h2>
          {selectedItem?.description && (
            <p className="card-muted">{selectedItem.description}</p>
          )}
        </div>
        <div className="dashboard-heading-action">
          <Link className="secondary-btn" to={listPath}>
            {t(`scopedEntityReport.detailBackTo.${kind}`)}
          </Link>
        </div>
      </div>

      <article className="card scoped-chart-panel entity-detail-chart-panel">
        <header>
          <div>
            <span className="eyebrow">{timeframe}</span>
            <h3>{selectedItem?.name ?? t("scopedEntityReport.loadingEntity")}</h3>
          </div>
          <div className="entity-detail-chart-actions">
            <TimeframeControl onChange={setTimeframe} value={timeframe} />
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
        {!isOutOfScope && chartState === "loading" && (
          <p role="status">{t("scopedEntityReport.loadingChart")}</p>
        )}
        {!isOutOfScope && chartState === "ready" && !series && (
          <p className="card-muted">{t("scopedEntityReport.noSalesForTimeframe")}</p>
        )}
        {!isOutOfScope && chartState === "ready" && series && (
          <AuthorizedLineChart
            label={series.entity_name}
            points={series.points}
            quantity={kind === "products"}
          />
        )}
      </article>
    </section>
  );
}
