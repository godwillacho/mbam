import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import type { TeamMember } from "../../types/workspace";
import "./TeamAccessPage.css";

const configurablePermissions = [
  "Record sales",
  "View own transactions",
  "View shop reports",
  "Manage one shop",
  "View reports",
  "Invite workers",
  "Manage one business",
  "Roles",
  "Reports",
  "Settings",
  "All shops",
  "All businesses",
];

function resolveRole(roleId: string, t: (key: string) => string) {
  return workspace.roles.find((role) => role.id === roleId) ? t(`roles.${roleId}`) : t("common.unknownRole");
}

function resolveScope(memberBusinessId: string | undefined, memberUnitId: string | undefined, t: (key: string) => string) {
  if (memberUnitId) return workspace.businessUnits.find((unit) => unit.id === memberUnitId)?.name ?? t("common.unknownUnit");
  if (memberBusinessId) return workspace.businesses.find((business) => business.id === memberBusinessId)?.name ?? t("common.unknownBusiness");
  return t("common.entireMasterAccount");
}

function getDefaultPermissions(member: TeamMember): string[] {
  return workspace.roles.find((role) => role.id === member.roleId)?.permissions ?? [];
}

export default function TeamAccessPage() {
  const { t } = useTranslation();
  const [selectedMemberId, setSelectedMemberId] = useState(workspace.teamMembers[0]?.id ?? "");
  const [memberPermissions, setMemberPermissions] = useState<Record<string, string[]>>(() => {
    return Object.fromEntries(
      workspace.teamMembers.map((member) => [member.id, getDefaultPermissions(member)]),
    );
  });

  const selectedMember = workspace.teamMembers.find((member) => member.id === selectedMemberId) ?? workspace.teamMembers[0];
  const selectedPermissions = memberPermissions[selectedMember.id] ?? getDefaultPermissions(selectedMember);

  const togglePermission = (permission: string) => {
    setMemberPermissions((current) => {
      const permissions = current[selectedMember.id] ?? getDefaultPermissions(selectedMember);
      const nextPermissions = permissions.includes(permission)
        ? permissions.filter((item) => item !== permission)
        : [...permissions, permission];

      return { ...current, [selectedMember.id]: nextPermissions };
    });
  };

  const resetPermissions = () => {
    setMemberPermissions((current) => ({
      ...current,
      [selectedMember.id]: getDefaultPermissions(selectedMember),
    }));
  };

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("team.eyebrow")}</span>
          <h2>{t("team.title")}</h2>
          <p>{t("team.description")}</p>
        </div>
        <div className="dashboard-heading-action">
          <Link className="secondary-btn" to="/dashboard">{t("pendingPayments.backToDashboard")}</Link>
          <button className="primary-btn" type="button">{t("team.inviteWorker")}</button>
        </div>
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
                <td>
                  <button className="text-button" type="button" onClick={() => setSelectedMemberId(member.id)}>
                    {member.fullName}
                  </button>
                </td>
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

      <article className="card permission-editor-card">
        <header className="permission-editor-header">
          <div>
            <span className="eyebrow">{t("team.customPermissions")}</span>
            <h3>{selectedMember.fullName}</h3>
            <p className="card-muted">
              {resolveRole(selectedMember.roleId, t)} · {resolveScope(selectedMember.businessId, selectedMember.businessUnitId, t)}
            </p>
          </div>
          <button className="secondary-btn" type="button" onClick={resetPermissions}>{t("team.resetDefaults")}</button>
        </header>

        <div className="permission-toggle-grid">
          {configurablePermissions.map((permission) => {
            const enabled = selectedPermissions.includes(permission);
            return (
              <label className={enabled ? "permission-toggle enabled" : "permission-toggle"} key={permission}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => togglePermission(permission)}
                />
                <span>
                  <strong>{t(`permissions.${permission}`)}</strong>
                  <small>{enabled ? t("team.permissionEnabled") : t("team.permissionDisabled")}</small>
                </span>
              </label>
            );
          })}
        </div>
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
