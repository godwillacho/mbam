import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";

function resolveRole(roleId: string, t: (key: string) => string) {
  return workspace.roles.find((role) => role.id === roleId) ? t(`roles.${roleId}`) : t("common.unknownRole");
}

function resolveScope(memberBusinessId: string | undefined, memberUnitId: string | undefined, t: (key: string) => string) {
  if (memberUnitId) return workspace.businessUnits.find((unit) => unit.id === memberUnitId)?.name ?? t("common.unknownUnit");
  if (memberBusinessId) return workspace.businesses.find((business) => business.id === memberBusinessId)?.name ?? t("common.unknownBusiness");
  return t("common.entireMasterAccount");
}

export default function TeamAccessPage() {
  const { t } = useTranslation();

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("team.eyebrow")}</span>
          <h2>{t("team.title")}</h2>
          <p>{t("team.description")}</p>
        </div>
        <button className="primary-btn" type="button">{t("team.inviteWorker")}</button>
      </div>

      <article className="table-card">
        <header>
          <h3>{t("team.members")}</h3>
          <small>{t("team.scopedHint")}</small>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("team.name")}</th>
              <th>{t("team.email")}</th>
              <th>{t("team.role")}</th>
              <th>{t("team.scope")}</th>
              <th>{t("team.status")}</th>
            </tr>
          </thead>
          <tbody>
            {workspace.teamMembers.map((member) => (
              <tr key={member.id}>
                <td>{member.fullName}</td>
                <td>{member.email}</td>
                <td>{resolveRole(member.roleId, t)}</td>
                <td>{resolveScope(member.businessId, member.businessUnitId, t)}</td>
                <td>
                  <span className={member.status === "invited" ? "badge warning" : "badge"}>{t(`common.${member.status}`)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <div className="card-grid two">
        {workspace.roles.map((role) => (
          <article className="card" key={role.id}>
            <h3>{t(`roles.${role.id}`)}</h3>
            <div className="list-stack">
              {role.permissions.map((permission) => (
                <div className="list-item" key={permission}>
                  <strong>{t(`permissions.${permission}`)}</strong>
                  <span className="badge">{t("common.permission")}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
