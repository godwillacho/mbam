import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthorizedLineChart from "../../components/charts/AuthorizedLineChart";
import TimeframeControl from "../../components/charts/TimeframeControl";
import { workspace } from "../../data/mockWorkspace";
import { canManageProducts, getCurrentMember } from "../../security/accessControl";
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

type PageKind = "shops" | "employees" | "products";

interface EntityItem {
  id: string;
  name: string;
  description: string;
}

type SortColumn = "name" | "description";
type SortDirection = "asc" | "desc";

function compareEntities(a: EntityItem, b: EntityItem, column: SortColumn, direction: SortDirection): number {
  const comparison = a[column].localeCompare(b[column], undefined, { sensitivity: "base" });
  return direction === "asc" ? comparison : -comparison;
}

const pageCopy: Record<
  PageKind,
  { eyebrow: string; title: string; description: string }
> = {
  shops: {
    eyebrow: "Authorized shops",
    title: "Shop revenue",
    description: "Select an assigned shop to view its API-scoped revenue.",
  },
  employees: {
    eyebrow: "Authorized employees",
    title: "Employee sales",
    description: "Select an employee to view sales within your management scope.",
  },
  products: {
    eyebrow: "Authorized products",
    title: "Product sales",
    description: "Select a product to view sold quantity and revenue.",
  },
};

async function loadItems(kind: PageKind): Promise<EntityItem[]> {
  if (kind === "shops") {
    const bootstrap = await loadAuthorizationBootstrap();
    return bootstrap.business_units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      description:
        bootstrap.businesses.find((business) => business.id === unit.business_id)
          ?.name ?? "Authorized business",
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
  kind: PageKind,
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

export default function ScopedEntityReportPage({ kind }: { kind: PageKind }) {
  const { t } = useTranslation();
  const copy = pageCopy[kind];
  const member = getCurrentMember();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<EntityItem[]>([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("selected") ?? "");
  const [timeframe, setTimeframe] = useState<ReportTimeframe>("daily");
  const [series, setSeries] = useState<ReportSeries | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [listState, setListState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [chartState, setChartState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const currency = workspace.businesses[0]?.currency ?? "XAF";
  const dimension = kind as ReportDimension;

  useEffect(() => {
    let ignore = false;
    setListState("loading");
    loadItems(kind)
      .then((nextItems) => {
        if (ignore) return;
        setItems(nextItems);
        setSelectedId((current) => current || nextItems[0]?.id || "");
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
    if (!selectedId) {
      setSeries(null);
      setChartState("idle");
      return;
    }
    let ignore = false;
    setSeries(null);
    setChartState("loading");
    loadReport(dimension, reportFilters(kind, selectedId, timeframe))
      .then((report) => {
        if (ignore) return;
        setSeries(report.series.find((item) => item.entity_id === selectedId) ?? null);
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
  }, [dimension, kind, selectedId, timeframe]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId],
  );

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => compareEntities(a, b, sortColumn, sortDirection)),
    [items, sortColumn, sortDirection],
  );

  const select = (id: string) => {
    setSelectedId(id);
    setSearchParams({ selected: id }, { replace: true });
  };

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  };

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return null;
    return <span aria-hidden="true">{sortDirection === "asc" ? " ▲" : " ▼"}</span>;
  };

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p className="card-muted">{copy.description}</p>
        </div>
        <div className="dashboard-heading-action">
          {kind === "employees" && (
            <Link className="secondary-btn" to="/employees/manage">
              Manage employees
            </Link>
          )}
          {kind === "products" && canManageProducts(member) && (
            <Link className="secondary-btn" to="/products/manage">
              Manage products
            </Link>
          )}
          <TimeframeControl onChange={setTimeframe} value={timeframe} />
        </div>
      </div>

      <div className="scoped-split-page">
        <article className="table-card scoped-entity-table-card">
          <header>
            <h3>{copy.eyebrow}</h3>
          </header>
          {listState === "loading" && (
            <p className="scoped-entity-table-state" role="status">Loading…</p>
          )}
          {listState === "error" && (
            <p className="validation-summary scoped-entity-table-state" role="alert">
              The authorized list could not be loaded.
            </p>
          )}
          {listState === "ready" && items.length === 0 && (
            <p className="card-muted scoped-entity-table-state">No authorized entities are available.</p>
          )}
          {listState === "ready" && items.length > 0 && (
            <div className="scoped-entity-table-wrap">
              <table className="data-table scoped-entity-table">
                <thead>
                  <tr>
                    <th>
                      <button className="table-sort-button" onClick={() => toggleSort("name")} type="button">
                        {t("scopedEntityReport.nameColumn")}
                        {sortIndicator("name")}
                      </button>
                    </th>
                    <th>
                      <button className="table-sort-button" onClick={() => toggleSort("description")} type="button">
                        {t("scopedEntityReport.detailsColumn")}
                        {sortIndicator("description")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => {
                    const isSelected = selectedId === item.id;
                    return (
                      <tr
                        aria-current={isSelected ? "true" : undefined}
                        className={isSelected ? "scoped-entity-row active" : "scoped-entity-row"}
                        key={item.id}
                        onClick={() => select(item.id)}
                      >
                        <td>
                          <button
                            aria-label={t("scopedEntityReport.selectRow", { name: item.name })}
                            aria-pressed={isSelected}
                            className="scoped-entity-row-button"
                            onClick={() => select(item.id)}
                            type="button"
                          >
                            <strong>{item.name}</strong>
                            {isSelected && <span className="badge">{t("scopedEntityReport.selected")}</span>}
                          </button>
                        </td>
                        <td>{item.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="card scoped-chart-panel">
          <header>
            <div>
              <span className="eyebrow">{timeframe}</span>
              <h3>{selectedItem?.name ?? "Selected entity"}</h3>
            </div>
            {series && (
              <div className="scoped-chart-total">
                <strong>
                  {kind === "products"
                    ? `${series.total_quantity.toLocaleString()} sold`
                    : formatMoney(series.total_revenue, currency)}
                </strong>
                <small>{formatMoney(series.total_revenue, currency)}</small>
              </div>
            )}
          </header>
          {chartState === "idle" && (
            <p className="card-muted">Select an entity to view its report.</p>
          )}
          {chartState === "loading" && <p role="status">Loading chart…</p>}
          {chartState === "error" && (
            <p className="validation-summary" role="alert">
              This entity is unavailable or outside your current authorization.
            </p>
          )}
          {chartState === "ready" && !series && (
            <p className="card-muted">No sales exist for this timeframe.</p>
          )}
          {chartState === "ready" && series && (
            <AuthorizedLineChart
              label={series.entity_name}
              points={series.points}
              quantity={kind === "products"}
            />
          )}
        </article>
      </div>
    </section>
  );
}
