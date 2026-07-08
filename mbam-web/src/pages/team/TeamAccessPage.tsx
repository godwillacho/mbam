import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CsvImportPanel, { type CsvFieldDef } from "../../components/csv/CsvImportPanel";
import DevOnly from "../../components/app/DevOnly";
import { getCurrentMember } from "../../security/accessControl";
import { ApiClientError } from "../../services/apiClient";
import {
  disableEmployee,
  inviteEmployee,
  loadKeycloakSyncStatuses,
  loadTeamWorkspace,
  type KeycloakSyncStatus,
  updateEmployee,
  type TeamEmployee,
  type TeamRole,
  type TeamWorkspace,
} from "../../services/teamService";
import { markRolePolicyChanged } from "../../services/localSync/localSyncClient";
import "./TeamAccessPage.css";

const emptyInvite = { email: "", roleId: "", businessId: "", unitId: "" };
const customRoleValue = "__custom__";
const customRolePrefix = "custom_member_";
const customBaselineRoleCodes = ["cashier", "shop_manager", "business_admin"];

const screenAccessOptions = [
  { id: "recordTransaction", permission: "screen.record_transaction", grants: ["screen.record_transaction", "sale.create", "product.view", "business.view", "unit.view", "sync.pull", "sync.push"] },
  { id: "transactionDrafts", permission: "screen.transaction_drafts", grants: ["screen.transaction_drafts", "sale.create", "product.view", "business.view", "unit.view", "sync.pull", "sync.push"] },
  { id: "transactions", permission: "screen.transactions", grants: ["screen.transactions", "sale.view", "business.view", "unit.view", "sync.pull"] },
  { id: "businesses", permission: "screen.businesses", grants: ["screen.businesses", "business.view", "unit.view", "sync.pull"] },
  { id: "team", permission: "screen.team", grants: ["screen.team", "worker.view", "business.view", "unit.view", "sync.pull"] },
  { id: "products", permission: "screen.products", grants: ["screen.products", "product.view", "business.view", "unit.view", "sync.pull"] },
  { id: "stock", permission: "screen.stock", grants: ["screen.stock", "stock.movement.create", "stock.movement.view", "product.view", "business.view", "unit.view", "sync.pull", "sync.push"] },
  { id: "reports", permission: "screen.reports", grants: ["screen.reports", "report.view", "business.view", "unit.view", "sync.pull"] },
] as const;

type ScreenAccessId = (typeof screenAccessOptions)[number]["id"];

interface EmployeeCsvDraft {
  email: string;
  roleId: string;
  businessId: string;
  unitId: string;
}

function resolveByName(value: string, options: Array<{ id: string; name: string; code?: string }>): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  const match = options.find(
    (option) => option.name.trim().toLowerCase() === normalized || option.code?.trim().toLowerCase() === normalized,
  );
  return match?.id ?? "";
}

export default function TeamAccessPage() {
  const { t } = useTranslation();
  const currentActor = getCurrentMember();
  const canCustomizeRoles = currentActor.roleId === "role-master-owner"
    || currentActor.roleId === "role-business-admin";
  const [searchParams] = useSearchParams();
  const businessFilter = searchParams.get("business") ?? "";
  const [workspace, setWorkspace] = useState<TeamWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get("member") ?? "");
  const [invite, setInvite] = useState(() => ({ ...emptyInvite, businessId: businessFilter }));
  const [showInvite, setShowInvite] = useState(searchParams.get("invite") === "1");
  const [inviteUrl, setInviteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [roleSelection, setRoleSelection] = useState("");
  const [customBaseRoleId, setCustomBaseRoleId] = useState("");
  const [customScreens, setCustomScreens] = useState<Set<ScreenAccessId>>(new Set());
  const [syncStatuses, setSyncStatuses] = useState<KeycloakSyncStatus[]>([]);
  const [csvEmployeeDrafts, setCsvEmployeeDrafts] = useState<EmployeeCsvDraft[] | null>(null);
  const [isSendingCsvInvites, setIsSendingCsvInvites] = useState(false);

  const reload = useCallback(async () => {
    const [data, statuses] = await Promise.all([
      loadTeamWorkspace(),
      loadKeycloakSyncStatuses().catch(() => []),
    ]);
    setWorkspace(data);
    setSyncStatuses(statuses);
    setSelectedId((current) => {
      if (current && data.members.some((member) => member.id === current)) return current;
      if (!businessFilter) return data.members[0]?.id || "";
      const unitIds = new Set(data.business_units.filter((unit) => unit.business_id === businessFilter).map((unit) => unit.id));
      return data.members.find((member) => member.business_id === businessFilter || Boolean(member.business_unit_id && unitIds.has(member.business_unit_id)))?.id ?? "";
    });
    return data;
  }, [businessFilter]);

  useEffect(() => {
    reload().catch((requestError) => setError(errorMessage(requestError, t("team.loadError"))));
  }, [reload, t]);

  const standardRoles = useMemo(
    () => workspace?.roles.filter((role) => !role.code.startsWith(customRolePrefix)) ?? [],
    [workspace],
  );
  const employeeCsvFields: CsvFieldDef[] = useMemo(() => [
    { key: "email", label: t("team.csvFields.email"), aliases: ["email", "emailaddress"], required: true },
    { key: "role", label: t("team.csvFields.role"), aliases: ["role", "position", "jobtitle"] },
    { key: "business", label: t("team.csvFields.business"), aliases: ["business", "company", "businessname"] },
    { key: "unit", label: t("team.csvFields.unit"), aliases: ["unit", "shop", "shopname", "businessunit"] },
  ], [t]);
  const baselineRoles = useMemo(
    () => standardRoles.filter((role) => isCustomBaseRole(role.code)),
    [standardRoles],
  );
  const visibleMembers = useMemo(() => {
    if (!workspace) return [];
    if (!businessFilter) return workspace.members;
    const unitIds = new Set(workspace.business_units.filter((unit) => unit.business_id === businessFilter).map((unit) => unit.id));
    return workspace.members.filter((member) => member.business_id === businessFilter || (member.business_unit_id && unitIds.has(member.business_unit_id)));
  }, [businessFilter, workspace]);

  const selected = workspace?.members.find((member) => member.id === selectedId);
  const selectedSync = syncStatuses.find((status) => status.membership_id === selectedId);
  const failedSyncCount = syncStatuses.filter((status) => status.status === "failed").length;
  const customBaseRole = baselineRoles.find((role) => role.id === customBaseRoleId);
  const baselineScreenIds = useMemo<Set<ScreenAccessId>>(
    () => new Set(screenAccessOptions.filter((option) => customBaseRole?.permissions.includes(option.permission)).map((option) => option.id)),
    [customBaseRole],
  );

  useEffect(() => {
    if (!selected || !workspace) return;
    const role = workspace.roles.find((item) => item.id === selected.role_id);
    const baseRoleId = resolveCustomBaseRoleId(selected, baselineRoles);
    const baseRole = baselineRoles.find((item) => item.id === baseRoleId);
    setRoleSelection(selected.role_code.startsWith(customRolePrefix) ? customRoleValue : selected.role_id);
    setCustomBaseRoleId(baseRoleId);
    setCustomScreens(new Set(
      screenAccessOptions
        .filter((option) => role?.permissions.includes(option.permission) && !baseRole?.permissions.includes(option.permission))
        .map((option) => option.id),
    ));
  }, [baselineRoles, selected, workspace]);

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await inviteEmployee({
        email: invite.email.trim(),
        role_id: invite.roleId,
        business_id: invite.businessId || undefined,
        business_unit_id: invite.unitId || undefined,
      });
      setInviteUrl(response.invite_url);
      setInvite({ ...emptyInvite, businessId: businessFilter });
      await reload();
      setMessage(t("team.inviteCreated"));
    } catch (requestError) {
      setError(errorMessage(requestError, t("team.inviteError")));
    } finally {
      setSaving(false);
    }
  };

  const saveEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await updateEmployee(selected.id, {
        ...(roleSelection === customRoleValue
          ? { role_id: customBaseRoleId, custom_permissions: customPermissions(customScreens) }
          : { role_id: roleSelection }),
        business_id: String(form.get("businessId")) || null,
        business_unit_id: String(form.get("unitId")) || null,
        status: String(form.get("status")) as "active" | "disabled",
      });
      await reload();
      await markRolePolicyChanged(String(Date.now()));
      setMessage(t("team.employeeSaved"));
    } catch (requestError) {
      setError(errorMessage(requestError, t("team.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const handleEmployeeCsvImport = (records: Array<Record<string, string>>) => {
    if (!workspace) return;
    const drafts = records
      .map((record) => ({
        email: (record.email ?? "").trim(),
        roleId: resolveByName(record.role ?? "", standardRoles),
        businessId: resolveByName(record.business ?? "", workspace.businesses),
        unitId: resolveByName(record.unit ?? "", workspace.business_units),
      }))
      .filter((draft) => draft.email.length > 0);

    if (drafts.length === 0) {
      setError(t("team.csvNoRows"));
      return;
    }
    setError("");
    setMessage("");
    setCsvEmployeeDrafts(drafts);
  };

  const updateCsvDraft = (index: number, field: keyof EmployeeCsvDraft, value: string) => {
    setCsvEmployeeDrafts((current) => current?.map((draft, draftIndex) => (
      draftIndex === index
        ? { ...draft, [field]: value, ...(field === "businessId" ? { unitId: "" } : {}) }
        : draft
    )) ?? current);
  };

  const sendCsvInvites = async () => {
    if (!csvEmployeeDrafts) return;
    const validDrafts = csvEmployeeDrafts.filter((draft) => draft.email && draft.roleId);
    if (validDrafts.length === 0) return;

    setIsSendingCsvInvites(true);
    setError("");
    const failedEmails: string[] = [];
    let successCount = 0;

    for (const draft of validDrafts) {
      try {
        await inviteEmployee({
          email: draft.email,
          role_id: draft.roleId,
          business_id: draft.businessId || undefined,
          business_unit_id: draft.unitId || undefined,
        });
        successCount += 1;
      } catch {
        failedEmails.push(draft.email);
      }
    }

    setIsSendingCsvInvites(false);
    setCsvEmployeeDrafts(null);
    if (successCount > 0) {
      await reload();
      await markRolePolicyChanged(String(Date.now()));
    }
    setMessage(t("team.csvImportResult", { success: successCount }));
    if (failedEmails.length > 0) {
      setError(t("team.csvImportPartialFailure", { count: failedEmails.length, emails: failedEmails.join(", ") }));
    }
  };

  const removeEmployee = async (employee: TeamEmployee) => {
    setSaving(true);
    setError("");
    try {
      const updated = await disableEmployee(employee.id);
      setWorkspace((current) => current ? {
        ...current,
        members: current.members.map((member) => member.id === updated.id ? updated : member),
      } : current);
      await markRolePolicyChanged(String(Date.now()));
      setMessage(t("team.employeeDisabled"));
    } catch (requestError) {
      setError(errorMessage(requestError, t("team.saveError")));
    } finally {
      setSaving(false);
    }
  };

  if (!workspace) {
    return <section className="page-grid"><p className="card-muted">{t("team.loading")}</p>{error && <div className="validation-summary">{error}</div>}</section>;
  }

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div><span className="eyebrow">{t("team.eyebrow")}</span><h2>{t("team.title")}</h2><DevOnly><p>{t("team.description")}</p></DevOnly></div>
        <div className="dashboard-heading-action">
          <CsvImportPanel fields={employeeCsvFields} onImport={handleEmployeeCsvImport} triggerLabel={t("team.importEmployees")} />
          <button className="primary-btn" type="button" onClick={() => setShowInvite((value) => !value)}>{showInvite ? t("common.cancel") : t("team.inviteWorker")}</button>
        </div>
      </div>

      {error && <div className="validation-summary" role="alert">{error}</div>}
      {message && <div className="validation-success" role="status">{message}</div>}

      {csvEmployeeDrafts && (
        <article className="card employee-csv-review-card">
          <header>
            <span className="eyebrow">{t("csvImport.eyebrow")}</span>
            <h3>{t("team.csvReviewTitle")}</h3>
            <p className="card-muted">{t("team.csvReviewHint")}</p>
          </header>

          <div className="employee-csv-review-table-wrap">
            <table className="data-table employee-csv-review-table">
              <thead>
                <tr>
                  <th>{t("team.csvFields.email")}</th>
                  <th>{t("team.csvFields.role")}</th>
                  <th>{t("team.csvFields.business")}</th>
                  <th>{t("team.csvFields.unit")}</th>
                </tr>
              </thead>
              <tbody>
                {csvEmployeeDrafts.map((draft, index) => (
                  <tr key={`${draft.email}-${index}`}>
                    <td>{draft.email}</td>
                    <td>
                      <select
                        aria-label={t("team.csvFields.role")}
                        onChange={(event) => updateCsvDraft(index, "roleId", event.target.value)}
                        value={draft.roleId}
                      >
                        <option value="">{t("team.csvRoleUnresolved")}</option>
                        {standardRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={t("team.csvFields.business")}
                        onChange={(event) => updateCsvDraft(index, "businessId", event.target.value)}
                        value={draft.businessId}
                      >
                        <option value="">{t("team.csvBusinessUnresolved")}</option>
                        {workspace.businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={t("team.csvFields.unit")}
                        onChange={(event) => updateCsvDraft(index, "unitId", event.target.value)}
                        value={draft.unitId}
                      >
                        <option value="">{t("team.csvUnitUnresolved")}</option>
                        {workspace.business_units
                          .filter((unit) => !draft.businessId || unit.business_id === draft.businessId)
                          .map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="csv-mapping-actions">
            <button className="secondary-btn" disabled={isSendingCsvInvites} onClick={() => setCsvEmployeeDrafts(null)} type="button">
              {t("team.csvCancelReview")}
            </button>
            <button
              className="primary-btn"
              disabled={isSendingCsvInvites || !csvEmployeeDrafts.some((draft) => draft.email && draft.roleId)}
              onClick={() => void sendCsvInvites()}
              type="button"
            >
              {isSendingCsvInvites
                ? t("team.csvSendingInvites")
                : t("team.csvSendInvites", { count: csvEmployeeDrafts.filter((draft) => draft.email && draft.roleId).length })}
            </button>
          </div>
        </article>
      )}
      {failedSyncCount > 0 && (
        <div className="validation-summary" role="alert">
          {failedSyncCount} employee role update{failedSyncCount === 1 ? "" : "s"} could not be reconciled with Keycloak. Local membership remains authoritative and mismatched sign-ins fail closed.
        </div>
      )}

      {showInvite && (
        <form className="form-card employee-form" onSubmit={submitInvite}>
          <header><h3>{t("team.inviteTitle")}</h3><small>{t("team.inviteHint")}</small></header>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="invite-email">{t("team.email")}</label>
              <input id="invite-email" type="email" required value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <ScopeFields workspace={workspace} roleId={invite.roleId} businessId={invite.businessId} unitId={invite.unitId} onChange={setInvite} />
          </div>
          <button className="primary-btn" disabled={saving} type="submit">{t("team.createInvite")}</button>
          {inviteUrl && <div className="invite-link-box"><strong>{t("team.inviteLink")}</strong><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /></div>}
        </form>
      )}

      {selected && (
        <form className="card permission-editor-card" key={selected.id} onSubmit={saveEmployee}>
          <header className="permission-editor-header">
            <div><span className="eyebrow">{t("team.editEmployeeAccess")}</span><h3>{selected.full_name}</h3><p className="card-muted">{selected.email}</p></div>
            <button className="secondary-btn danger-text" disabled={saving || selected.status === "disabled"} type="button" onClick={() => void removeEmployee(selected)}>{t("team.disableEmployee")}</button>
          </header>
          {selectedSync && selectedSync.status !== "succeeded" && (
            <div className={selectedSync.status === "failed" ? "validation-summary" : "product-revenue-source-note"} role="status">
              Identity synchronization: {selectedSync.status}
              {selectedSync.last_error ? ` — ${selectedSync.last_error}` : ""}
            </div>
          )}
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="employee-selector">{t("team.selectEmployee")}</label>
              <select id="employee-selector" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                {visibleMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name} · {member.email}</option>)}
              </select>
              <small>{t("team.scopedHint")}</small>
            </div>
            <div className="form-field">
              <label htmlFor="employee-role">{t("team.role")}</label>
              <select id="employee-role" value={roleSelection} onChange={(event) => {
                const value = event.target.value;
                setRoleSelection(value);
                if (value !== customRoleValue) {
                  setCustomBaseRoleId(value);
                  setCustomScreens(new Set());
                } else if (!customBaseRoleId) {
                  setCustomBaseRoleId(resolveCustomBaseRoleId(selected, baselineRoles));
                }
              }}>
                {standardRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                {canCustomizeRoles && <option value={customRoleValue}>{t("team.customRole")}</option>}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="employee-business">{t("team.business")}</label>
              <select id="employee-business" name="businessId" defaultValue={selected.business_id ?? ""}>
                <option value="">{t("team.noBusiness")}</option>
                {workspace.businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="employee-unit">{t("team.unit")}</label>
              <select id="employee-unit" name="unitId" defaultValue={selected.business_unit_id ?? ""}>
                <option value="">{t("team.noUnit")}</option>
                {workspace.business_units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="employee-status">{t("team.status")}</label>
              <select id="employee-status" name="status" defaultValue={selected.status}>
                <option value="active">{t("common.active")}</option>
                <option value="disabled">{t("team.disabledLabel")}</option>
              </select>
            </div>
          </div>

          {canCustomizeRoles && roleSelection === customRoleValue && (
            <div className="custom-screen-access">
              <div><span className="eyebrow">{t("team.customPermissions")}</span><h4>{t("team.customScreenTitle")}</h4><p className="card-muted">{t("team.customScreenHint")}</p></div>
              <div className="form-field full">
                <label htmlFor="custom-base-role">Baseline role</label>
                <select id="custom-base-role" required value={customBaseRoleId} onChange={(event) => {
                  setCustomBaseRoleId(event.target.value);
                  const nextBaseRole = baselineRoles.find((role) => role.id === event.target.value);
                  const nextBaselineScreens = new Set<ScreenAccessId>(
                    screenAccessOptions.filter((option) => nextBaseRole?.permissions.includes(option.permission)).map((option) => option.id),
                  );
                  setCustomScreens((current) => new Set(Array.from(current).filter((screenId) => !nextBaselineScreens.has(screenId))));
                }}>
                  <option value="">Select baseline role</option>
                  {baselineRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
                <small>Custom menus are added on top of this baseline.</small>
              </div>
              <div className="permission-toggle-grid">
                {screenAccessOptions.map((option) => {
                  const baseline = baselineScreenIds.has(option.id);
                  const enabled = baseline || customScreens.has(option.id);
                  return (
                    <label className={enabled ? "permission-toggle enabled" : "permission-toggle"} key={option.id}>
                      <input checked={enabled} disabled={baseline} type="checkbox" onChange={() => setCustomScreens((current) => {
                        const next = new Set(current);
                        if (next.has(option.id)) next.delete(option.id);
                        else next.add(option.id);
                        return next;
                      })} />
                      <span><strong>{t(`team.screens.${option.id}`)}</strong><small>{baseline ? "Baseline access" : enabled ? t("team.permissionEnabled") : t("team.permissionDisabled")}</small></span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <button className="primary-btn" disabled={saving || !roleSelection || (roleSelection === customRoleValue && !customBaseRoleId)} type="submit">{t("team.saveEmployee")}</button>
        </form>
      )}

      {visibleMembers.length === 0 && <div className="card team-empty-state"><h3>{t("team.noEmployees")}</h3><p className="card-muted">{t("team.noEmployeesHint")}</p></div>}
    </section>
  );
}

function customPermissions(screenIds: Set<ScreenAccessId>): string[] {
  return Array.from(new Set(screenAccessOptions.filter((option) => screenIds.has(option.id)).flatMap((option) => option.grants)));
}

function isCustomBaseRole(roleCode: string): boolean {
  return customBaselineRoleCodes.includes(roleCode);
}

function customBaselineRoleCode(roleCode: string): string | undefined {
  const customCode = roleCode.startsWith(customRolePrefix) ? roleCode.slice(customRolePrefix.length) : "";
  if (customCode.startsWith("business_admin_")) return "business_admin";
  if (customCode.startsWith("shop_manager_")) return "shop_manager";
  if (customCode.startsWith("cashier_")) return "cashier";
  return undefined;
}

function resolveCustomBaseRoleId(member: TeamEmployee, roles: TeamRole[]): string {
  const customBaseCode = customBaselineRoleCode(member.role_code);
  if (customBaseCode) return roles.find((role) => role.code === customBaseCode)?.id ?? "";
  if (isCustomBaseRole(member.role_code)) return member.role_id;
  return "";
}

function ScopeFields({ workspace, roleId, businessId, unitId, onChange }: {
  workspace: TeamWorkspace;
  roleId: string;
  businessId: string;
  unitId: string;
  onChange: Dispatch<SetStateAction<typeof emptyInvite>>;
}) {
  const { t } = useTranslation();
  const units = workspace.business_units.filter((unit) => unit.business_id === businessId);
  return (
    <>
      <div className="form-field">
        <label htmlFor="invite-role">{t("team.role")}</label>
        <select id="invite-role" required value={roleId} onChange={(event) => onChange((current) => ({ ...current, roleId: event.target.value }))}>
          <option value="">{t("team.selectRole")}</option>
          {workspace.roles.filter((role) => !role.code.startsWith(customRolePrefix)).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="invite-business">{t("team.business")}</label>
        <select id="invite-business" required value={businessId} onChange={(event) => onChange((current) => ({ ...current, businessId: event.target.value, unitId: "" }))}>
          <option value="">{t("team.selectBusiness")}</option>
          {workspace.businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="invite-unit">{t("team.unit")}</label>
        <select id="invite-unit" value={unitId} onChange={(event) => onChange((current) => ({ ...current, unitId: event.target.value }))}>
          <option value="">{t("team.noUnit")}</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </div>
    </>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}
