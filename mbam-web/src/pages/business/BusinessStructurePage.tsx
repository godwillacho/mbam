import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { formatMoney } from "../../utils/formatters";

export default function BusinessStructurePage() {
  const { t } = useTranslation();

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("businesses.eyebrow")}</span>
          <h2>{t("businesses.title")}</h2>
          <p>{t("businesses.description")}</p>
        </div>
        <button className="primary-btn" type="button">{t("businesses.createBusiness")}</button>
      </div>

      <div className="card-grid two">
        {workspace.businesses.map((business) => {
          const units = workspace.businessUnits.filter((unit) => unit.businessId === business.id);
          const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);

          return (
            <article className="card" key={business.id}>
              <h3>{business.name}</h3>
              <p className="card-muted">{business.type} · {business.country} · {business.currency}</p>
              <div className="list-stack">
                {units.map((unit) => (
                  <div className="list-item" key={unit.id}>
                    <div>
                      <strong>{unit.name}</strong>
                      <small>{t(`unitTypes.${unit.type}`)} · {unit.location}</small>
                    </div>
                    <span className="badge">{formatMoney(unit.todayRevenue, business.currency)}</span>
                  </div>
                ))}
              </div>
              <p className="card-muted" style={{ marginTop: 14 }}>
                {t("businesses.totalToday")}: {formatMoney(revenue, business.currency)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
