import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { canManageProducts, getCurrentMember, getScopedUnits } from "../../routing/accessControl";
import { loadAuthorizationBootstrap } from "../../services/authorizationService";
import { listAuthorizedProductsOnline } from "../../services/productService";
import { loadTeamWorkspace } from "../../services/teamService";
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

// Reuse the same labels the sidebar nav already shows for these pages
// ("employees" pages are labeled "Employees" via the "team" nav key).
const featureLabelKey: Record<PageKind, string> = {
  shops: "app.nav.shops",
  employees: "app.nav.team",
  products: "app.nav.products",
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

export default function ScopedEntityReportPage({ kind }: { kind: PageKind }) {
  const { t } = useTranslation();
  const member = getCurrentMember();
  const scopedUnits = useMemo(() => getScopedUnits(member), [member]);
  const singleShopName = kind === "shops" && scopedUnits.length === 1 ? scopedUnits[0].name : null;
  const pageLabel = singleShopName ?? t(featureLabelKey[kind]);
  const navigate = useNavigate();
  const [items, setItems] = useState<EntityItem[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [listState, setListState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

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

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => compareEntities(a, b, sortColumn, sortDirection)),
    [items, sortColumn, sortDirection],
  );

  const detailPath = (id: string) => `/${kind}/${id}`;

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
      <div className="page-heading scoped-entity-heading">
        <h2>{pageLabel}</h2>
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
        </div>
      </div>

      <article className="table-card scoped-entity-table-card scoped-entity-table-card-full">
        {listState === "loading" && (
          <p className="scoped-entity-table-state" role="status">
            {t("scopedEntityReport.loadingList")}
          </p>
        )}
        {listState === "error" && (
          <p className="validation-summary scoped-entity-table-state" role="alert">
            {t("scopedEntityReport.listLoadError")}
          </p>
        )}
        {listState === "ready" && items.length === 0 && (
          <p className="card-muted scoped-entity-table-state">
            {t("scopedEntityReport.noAuthorizedEntities")}
          </p>
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
                {sortedItems.map((item) => (
                  <tr
                    className="scoped-entity-row"
                    key={item.id}
                    onClick={() => navigate(detailPath(item.id))}
                  >
                    <td>
                      <Link
                        aria-label={t("scopedEntityReport.selectRow", { name: item.name })}
                        className="scoped-entity-row-button"
                        onClick={(event) => event.stopPropagation()}
                        to={detailPath(item.id)}
                      >
                        <strong>{item.name}</strong>
                      </Link>
                    </td>
                    <td>{item.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
