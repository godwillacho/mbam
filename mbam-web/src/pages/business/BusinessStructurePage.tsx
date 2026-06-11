import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { formatMoney } from "../../utils/formatters";

export default function BusinessStructurePage() {
  const { t } = useTranslation();

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("businesses.eyebrow")}</span>
          <h2>{t("businesses.title")}</h2>
          <p>{t("businesses.description")}</p>
        </div>
        <div className="dashboard-heading-action">
          <button className="primary-btn" type="button">{t("businesses.createBusiness")}</button>
        </div>
      </div>

      <div className="card-grid two">
        {workspace.businesses.map((business) => {
          const units = workspace.businessUnits.filter((unit) => unit.businessId === business.id);
          const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);
          const businessTeam = workspace.teamMembers.filter((member) => member.businessId === business.id || units.some((unit) => unit.id === member.businessUnitId));

          return (
            <article className="card" key={business.id}>
              <header>
                <div>
                  <h3>{business.name}</h3>
                  <p className="card-muted">{business.type} · {business.country} · {business.currency}</p>
                </div>
                <Link className="secondary-btn" to={`/team?business=${business.id}`}>{t("businesses.openEmployees")}</Link>
              </header>

              <p className="card-muted" style={{ marginTop: 8 }}>
                {t("businesses.totalToday")}: {formatMoney(revenue, business.currency)} · {t("businesses.employeeCount", { count: businessTeam.length })}
              </p>

              <div className="list-stack" style={{ marginTop: 16 }}>
                {units.map((unit) => {
                  const unitTeam = workspace.teamMembers.filter((member) => member.businessUnitId === unit.id);

                  return (
                    <div className="list-item nested-business-unit" key={unit.id}>
                      <div>
                        <strong>{unit.name}</strong>
                        <small>{t(`unitTypes.${unit.type}`)} · {unit.location}</small>
                        <div className="nested-team-list">
                          <span>{t("businesses.teamMembers")}</span>
                          {unitTeam.length > 0 ? unitTeam.map((member) => (
                            <Link key={member.id} className="text-button" to={`/team?member=${member.id}`}>{member.fullName} · {t(`roles.${member.roleId}`)}</Link>
                          )) : <small>{t("businesses.noTeamMembers")}</small>}
                        </div>
                      </div>
                      <span className="badge">{formatMoney(unit.todayRevenue, business.currency)}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
