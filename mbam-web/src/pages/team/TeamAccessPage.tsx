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
import DevOnly from "../../components/app/DevOnly";
import { ApiClientError } from "../../services/apiClient";
import {
  disableEmployee,
  inviteEmployee,
  loadTeamWorkspace,
  updateEmployee,
  type TeamEmployee,
  type TeamWorkspace,
} from "../../services/teamService";
import { markRolePolicyChanged } from "../../services/localSync/localSyncClient";
import "./TeamAccessPage.css";

const emptyInvite = { email: "", roleId: "", businessId: "", unitId: "" };

export default function TeamAccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const businessFilter = searchParams.get("business") ?? "";
  const [workspace, setWorkspace] = useState<TeamWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState(
    searchParams.get("member") ?? "",
  );
  const [invite, setInvite] = useState(() => ({
    ...emptyInvite,
    businessId: businessFilter,
  }));
  const [showInvite, setShowInvite] = useState(
    searchParams.get("invite") === "1",
  );
  const [inviteUrl, setInviteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    const data = await loadTeamWorkspace();
    setWorkspace(data);
    setSelectedId((current) => {
      if (current && data.members.some((member) => member.id === current)) {
        return current;
      }
      if (!businessFilter) {
        return data.members[0]?.id || "";
      }
      const unitIds = new Set(
        data.business_units
          .filter((unit) => unit.business_id === businessFilter)
          .map((unit) => unit.id),
      );
      return (
        data.members.find(
          (member) =>
            member.business_id === businessFilter ||
            Boolean(
              member.business_unit_id && unitIds.has(member.business_unit_id),
            ),
        )?.id ?? ""
      );
    });
    return data;
  }, [businessFilter]);

  useEffect(() => {
    reload().catch((requestError) =>
      setError(errorMessage(requestError, t("team.loadError"))),
    );
  }, [reload, t]);

  const visibleMembers = useMemo(() => {
    if (!workspace) return [];
    if (!businessFilter) return workspace.members;
    const unitIds = new Set(
      workspace.business_units
        .filter((unit) => unit.business_id === businessFilter)
        .map((unit) => unit.id),
    );
    return workspace.members.filter(
      (member) =>
        member.business_id === businessFilter ||
        (member.business_unit_id && unitIds.has(member.business_unit_id)),
    );
  }, [businessFilter, workspace]);

  const selected = workspace?.members.find(
    (member) => member.id === selectedId,
  );

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
      const updated = await updateEmployee(selected.id, {
        role_id: String(form.get("roleId")),
        business_id: String(form.get("businessId")) || null,
        business_unit_id: String(form.get("unitId")) || null,
        status: String(form.get("status")) as "active" | "disabled",
      });
      setWorkspace((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.id === updated.id ? updated : member,
              ),
            }
          : current,
      );
      await markRolePolicyChanged(String(Date.now()));
      setMessage(t("team.employeeSaved"));
    } catch (requestError) {
      setError(errorMessage(requestError, t("team.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const removeEmployee = async (employee: TeamEmployee) => {
    setSaving(true);
    setError("");
    try {
      const updated = await disableEmployee(employee.id);
      setWorkspace((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.id === updated.id ? updated : member,
              ),
            }
          : current,
      );
      await markRolePolicyChanged(String(Date.now()));
      setMessage(t("team.employeeDisabled"));
    } catch (requestError) {
      setError(errorMessage(requestError, t("team.saveError")));
    } finally {
      setSaving(false);
    }
  };

  if (!workspace) {
    return (
      <section className="page-grid">
        <p className="card-muted">{t("team.loading")}</p>
        {error && <div className="validation-summary">{error}</div>}
      </section>
    );
  }

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("team.eyebrow")}</span>
          <h2>{t("team.title")}</h2>
          <DevOnly>
            <p>{t("team.description")}</p>
          </DevOnly>
        </div>
        <button
          className="primary-btn"
          type="button"
          onClick={() => setShowInvite((value) => !value)}
        >
          {showInvite ? t("common.cancel") : t("team.inviteWorker")}
        </button>
      </div>

      {error && (
        <div className="validation-summary" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="validation-success" role="status">
          {message}
        </div>
      )}

      {showInvite && (
        <form className="form-card employee-form" onSubmit={submitInvite}>
          <header>
            <h3>{t("team.inviteTitle")}</h3>
            <small>{t("team.inviteHint")}</small>
          </header>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="invite-email">{t("team.email")}</label>
              <input
                id="invite-email"
                type="email"
                required
                value={invite.email}
                onChange={(event) =>
                  setInvite((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </div>
            <ScopeFields
              workspace={workspace}
              roleId={invite.roleId}
              businessId={invite.businessId}
              unitId={invite.unitId}
              onChange={setInvite}
            />
          </div>
          <button className="primary-btn" disabled={saving} type="submit">
            {t("team.createInvite")}
          </button>
          {inviteUrl && (
            <div className="invite-link-box">
              <strong>{t("team.inviteLink")}</strong>
              <input
                readOnly
                value={inviteUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          )}
        </form>
      )}

      {selected && (
        <form
          className="card permission-editor-card"
          key={selected.id}
          onSubmit={saveEmployee}
        >
          <header className="permission-editor-header">
            <div>
              <span className="eyebrow">{t("team.editEmployeeAccess")}</span>
              <h3>{selected.full_name}</h3>
              <p className="card-muted">{selected.email}</p>
            </div>
            <button
              className="secondary-btn danger-text"
              disabled={saving || selected.status === "disabled"}
              type="button"
              onClick={() => void removeEmployee(selected)}
            >
              {t("team.disableEmployee")}
            </button>
          </header>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="employee-selector">
                {t("team.selectEmployee")}
              </label>
              <select
                id="employee-selector"
                value={selected.id}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {visibleMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} · {member.email}
                  </option>
                ))}
              </select>
              <small>{t("team.scopedHint")}</small>
            </div>
            <div className="form-field">
              <label htmlFor="employee-role">{t("team.role")}</label>
              <select
                id="employee-role"
                name="roleId"
                defaultValue={selected.role_id}
              >
                {workspace.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="employee-business">{t("team.business")}</label>
              <select
                id="employee-business"
                name="businessId"
                defaultValue={selected.business_id ?? ""}
              >
                <option value="">{t("team.noBusiness")}</option>
                {workspace.businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="employee-unit">{t("team.unit")}</label>
              <select
                id="employee-unit"
                name="unitId"
                defaultValue={selected.business_unit_id ?? ""}
              >
                <option value="">{t("team.noUnit")}</option>
                {workspace.business_units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="employee-status">{t("team.status")}</label>
              <select
                id="employee-status"
                name="status"
                defaultValue={selected.status}
              >
                <option value="active">{t("common.active")}</option>
                <option value="disabled">{t("team.disabledLabel")}</option>
              </select>
            </div>
          </div>
          <button className="primary-btn" disabled={saving} type="submit">
            {t("team.saveEmployee")}
          </button>
        </form>
      )}

      {visibleMembers.length === 0 && (
        <div className="card team-empty-state">
          <h3>{t("team.noEmployees")}</h3>
          <p className="card-muted">{t("team.noEmployeesHint")}</p>
        </div>
      )}
    </section>
  );
}

function ScopeFields({
  workspace,
  roleId,
  businessId,
  unitId,
  onChange,
}: {
  workspace: TeamWorkspace;
  roleId: string;
  businessId: string;
  unitId: string;
  onChange: Dispatch<SetStateAction<typeof emptyInvite>>;
}) {
  const { t } = useTranslation();
  const units = workspace.business_units.filter(
    (unit) => unit.business_id === businessId,
  );
  return (
    <>
      <div className="form-field">
        <label htmlFor="invite-role">{t("team.role")}</label>
        <select
          id="invite-role"
          required
          value={roleId}
          onChange={(event) =>
            onChange((current) => ({ ...current, roleId: event.target.value }))
          }
        >
          <option value="">{t("team.selectRole")}</option>
          {workspace.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="invite-business">{t("team.business")}</label>
        <select
          id="invite-business"
          required
          value={businessId}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              businessId: event.target.value,
              unitId: "",
            }))
          }
        >
          <option value="">{t("team.selectBusiness")}</option>
          {workspace.businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="invite-unit">{t("team.unit")}</label>
        <select
          id="invite-unit"
          value={unitId}
          onChange={(event) =>
            onChange((current) => ({ ...current, unitId: event.target.value }))
          }
        >
          <option value="">{t("team.noUnit")}</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}
