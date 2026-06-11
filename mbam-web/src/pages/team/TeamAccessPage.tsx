import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import type { TeamMember } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
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

const recommendedRoleIds = ["role-cashier", "role-shop-manager", "role-business-admin"];
type PermissionMode = "role-cashier" | "role-shop-manager" | "role-business-admin" | "custom";

function resolveRole(roleId: string, t: (key: string) => string) {
  return workspace.roles.find((role) => role.id === roleId) ? t(`roles.${roleId}`) : t("common.unknownRole");
}

function resolveScope(memberBusinessId: string | undefined, memberUnitId: string | undefined, t: (key: string) => string) {
  if (memberUnitId) return workspace.businessUnits.find((unit) => unit.id === memberUnitId)?.name ?? t("common.unknownUnit");
  if (memberBusinessId) return workspace.businesses.find((business) => business.id === memberBusinessId)?.name ?? t("common.unknownBusiness");
  return t("common.entireMasterAccount");
}

function getRolePermissions(roleId: string): string[] {
  return workspace.roles.find((role) => role.id === roleId)?.permissions ?? [];
}

function getDefaultPermissions(member: TeamMember): string[] {
  return getRolePermissions(member.roleId);
}

function getDefaultPermissionMode(member: TeamMember): PermissionMode {
  return recommendedRoleIds.includes(member.roleId) ? member.roleId as PermissionMode : "custom";
}

function belongsToBusiness(member: TeamMember, businessId: string): boolean {
  if (member.businessId === businessId) return true;
  const unit = member.businessUnitId ? workspace.businessUnits.find((item) => item.id === member.businessUnitId) : undefined;
  return unit?.businessId === businessId;
}

export default function TeamAccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const businessFilter = searchParams.get("business") ?? "";
  const requestedMemberId = searchParams.get("member") ?? "";
  const initialMemberId = requestedMemberId || workspace.teamMembers.find((member) => businessFilter && belongsToBusiness(member, businessFilter))?.id || workspace.teamMembers[0]?.id || "";
  const [selectedMemberId, setSelectedMemberId] = useState(initialMemberId);
  const [isEditingAccess, setIsEditingAccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [memberPermissions, setMemberPermissions] = useState<Record<string, string[]>>(() => {
    return Object.fromEntries(workspace.teamMembers.map((member) => [member.id, getDefaultPermissions(member)]));
  });
  const [permissionModes, setPermissionModes] = useState<Record<string, PermissionMode>>(() => {
    return Object.fromEntries(workspace.teamMembers.map((member) => [member.id, getDefaultPermissionMode(member)]));
  });

  const visibleMembers = useMemo(() => {
    if (!businessFilter) return workspace.teamMembers;
    return workspace.teamMembers.filter((member) => belongsToBusiness(member, businessFilter));
  }, [businessFilter]);

  const selectedMember = workspace.teamMembers.find((member) => member.id === selectedMemberId) ?? visibleMembers[0] ?? workspace.teamMembers[0];
  const selectedPermissions = memberPermissions[selectedMember.id] ?? getDefaultPermissions(selectedMember);
  const selectedMode = permissionModes[selectedMember.id] ?? getDefaultPermissionMode(selectedMember);
  const memberTransactions = workspace.transactions.filter((transaction) => transaction.recordedBy === selectedMember.fullName);
  const memberSales = productSales.filter((sale) => sale.recordedBy === selectedMember.fullName);
  const memberRevenue = memberTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const productQuantity = memberSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const maxProductQuantity = Math.max(...memberSales.map((sale) => sale.quantity), 1);

  const selectEmployee = (memberId: string) => {
    setSelectedMemberId(memberId);
    setSaveMessage("");
    setIsEditingAccess(false);
  };

  const selectPermissionMode = (mode: PermissionMode) => {
    setSaveMessage("");
    setPermissionModes((current) => ({ ...current, [selectedMember.id]: mode }));
    if (mode !== "custom") {
      setMemberPermissions((current) => ({ ...current, [selectedMember.id]: getRolePermissions(mode) }));
    }
  };

  const togglePermission = (permission: string) => {
    setSaveMessage("");
    setPermissionModes((current) => ({ ...current, [selectedMember.id]: "custom" }));
    setMemberPermissions((current) => {
      const permissions = current[selectedMember.id] ?? getDefaultPermissions(selectedMember);
      const nextPermissions = permissions.includes(permission)
        ? permissions.filter((item) => item !== permission)
        : [...permissions, permission];

      return { ...current, [selectedMember.id]: nextPermissions };
    });
  };

  const resetPermissions = () => {
    setSaveMessage("");
    setPermissionModes((current) => ({ ...current, [selectedMember.id]: getDefaultPermissionMode(selectedMember) }));
    setMemberPermissions((current) => ({ ...current, [selectedMember.id]: getDefaultPermissions(selectedMember) }));
  };

  const savePermissions = () => {
    setSaveMessage(t("team.permissionsSaved", { name: selectedMember.fullName }));
    setIsEditingAccess(false);
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
          <button className="primary-btn" type="button">{t("team.inviteWorker")}</button>
        </div>
      </div>

      {saveMessage && <div className="validation-success" role="status">{saveMessage}</div>}

      <article className="table-card">
        <header>
          <h3>{t("team.members")}</h3>
          <small>{businessFilter ? workspace.businesses.find((business) => business.id === businessFilter)?.name : t("team.scopedHint")}</small>
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
            {visibleMembers.map((member) => (
              <tr key={member.id} className={member.id === selectedMember.id ? "selected-row" : undefined}>
                <td>
                  <button className="text-button" type="button" onClick={() => selectEmployee(member.id)}>
                    {member.fullName}
                  </button>
                </td>
                <td>{member.email}</td>
                <td>{resolveRole(member.roleId, t)}</td>
                <td>{resolveScope(member.businessId, member.businessUnitId, t)}</td>
                <td><span className={member.status === "invited" ? "badge warning" : "badge"}>{t(`common.${member.status}`)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="card permission-editor-card">
        <header className="permission-editor-header">
          <div>
            <span className="eyebrow">{t("team.performance")}</span>
            <h3>{selectedMember.fullName}</h3>
            <p className="card-muted">{t("team.performanceHint")}</p>
          </div>
          <button className="secondary-btn" type="button" onClick={() => setIsEditingAccess((current) => !current)}>
            {isEditingAccess ? t("team.hideEmployeeAccess") : t("team.editEmployeeAccess")}
          </button>
        </header>

        <div className="metrics-grid clean-metrics-grid">
          <article className="metric-card"><span>{t("team.revenueHandled")}</span><strong>{formatMoney(memberRevenue, workspace.masterAccount.currency)}</strong><small>{selectedMember.fullName}</small></article>
          <article className="metric-card"><span>{t("team.transactionsHandled")}</span><strong>{memberTransactions.length}</strong><small>{resolveRole(selectedMember.roleId, t)}</small></article>
          <article className="metric-card"><span>{t("team.productsSold")}</span><strong>{productQuantity}</strong><small>{resolveScope(selectedMember.businessId, selectedMember.businessUnitId, t)}</small></article>
        </div>

        {memberSales.length === 0 ? <p className="card-muted">{t("team.noPerformance")}</p> : (
          <div className="list-stack" style={{ marginTop: 16 }}>
            {memberSales.map((sale) => {
              const product = workspace.products.find((item) => item.id === sale.productId);
              const width = `${Math.max((sale.quantity / maxProductQuantity) * 100, 8)}%`;
              return (
                <div className="list-item" key={sale.id}>
                  <div style={{ width: "100%" }}>
                    <strong>{product?.name ?? sale.productId}</strong>
                    <small>{sale.customerName} · {formatMoney(sale.quantity * sale.unitPrice, workspace.masterAccount.currency)}</small>
                    <div className="performance-bar"><span style={{ width }} /></div>
                  </div>
                  <span className="badge">{sale.quantity}</span>
                </div>
              );
            })}
          </div>
        )}
      </article>

      {isEditingAccess && (
        <article className="card permission-editor-card">
          <header className="permission-editor-header">
            <div>
              <span className="eyebrow">{t("team.permissionProfile")}</span>
              <h3>{selectedMember.fullName}</h3>
              <p className="card-muted">{resolveRole(selectedMember.roleId, t)} · {resolveScope(selectedMember.businessId, selectedMember.businessUnitId, t)}</p>
            </div>
            <div className="dashboard-heading-action">
              <button className="secondary-btn" type="button" onClick={resetPermissions}>{t("team.resetDefaults")}</button>
              <button className="primary-btn" type="button" onClick={savePermissions}>{t("team.savePermissions")}</button>
            </div>
          </header>

          <div className="permission-profile-grid">
            {recommendedRoleIds.map((roleId) => (
              <button key={roleId} className={selectedMode === roleId ? "permission-profile-card active" : "permission-profile-card"} type="button" onClick={() => selectPermissionMode(roleId as PermissionMode)}>
                <strong>{t(`roles.${roleId}`)}</strong>
                <small>{t(`team.roleRecommendations.${roleId}`)}</small>
              </button>
            ))}
            <button className={selectedMode === "custom" ? "permission-profile-card active" : "permission-profile-card"} type="button" onClick={() => selectPermissionMode("custom")}>
              <strong>{t("team.customizable")}</strong>
              <small>{t("team.customizableHint")}</small>
            </button>
          </div>

          {selectedMode === "custom" && (
            <div className="permission-toggle-grid">
              {configurablePermissions.map((permission) => {
                const enabled = selectedPermissions.includes(permission);
                return (
                  <label className={enabled ? "permission-toggle enabled" : "permission-toggle"} key={permission}>
                    <input type="checkbox" checked={enabled} onChange={() => togglePermission(permission)} />
                    <span>
                      <strong>{t(`permissions.${permission}`)}</strong>
                      <small>{enabled ? t("team.permissionEnabled") : t("team.permissionDisabled")}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </article>
      )}
    </section>
  );
}
