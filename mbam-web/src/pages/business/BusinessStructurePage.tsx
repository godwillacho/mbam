import {
  Fragment,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
import { updateCloudWorkspace, workspace } from "../../data/mockWorkspace";
import { ApiClientError } from "../../services/apiClient";
import {
  BUSINESS_WORKSPACE_CHANGE_EVENT,
  createBusiness,
  createBusinessUnit,
  listBusinesses,
  listBusinessUnits,
} from "../../services/businessService";
import {
  loadTeamWorkspace,
  type TeamWorkspace,
} from "../../services/teamService";
import type { Business, BusinessUnit, UnitType } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
import "./BusinessStructurePage.css";

const initialBusinessForm = {
  name: "",
  businessType: "retail",
  country: "",
  currency: workspace.masterAccount.currency,
};

const initialUnitForm: { name: string; unitType: UnitType; location: string } =
  {
    name: "",
    unitType: "shop",
    location: "",
  };

export default function BusinessStructurePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [teamWorkspace, setTeamWorkspace] = useState<TeamWorkspace | null>(
    null,
  );
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [isBusinessFormOpen, setIsBusinessFormOpen] = useState(false);
  const [isUnitFormOpen, setIsUnitFormOpen] = useState(false);
  const [businessForm, setBusinessForm] = useState(initialBusinessForm);
  const [unitForm, setUnitForm] = useState(initialUnitForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedBusinessIds, setExpandedBusinessIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(
    new Set(),
  );

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const loadedBusinesses = await listBusinesses();
      const loadedUnits = (
        await Promise.all(
          loadedBusinesses.map((business) => listBusinessUnits(business.id)),
        )
      ).flat();
      setBusinesses(loadedBusinesses);
      setBusinessUnits(loadedUnits);
      setExpandedBusinessIds((current) =>
        current.size > 0
          ? current
          : new Set(loadedBusinesses.map((business) => business.id)),
      );
      updateCloudWorkspace({
        businesses: loadedBusinesses,
        businessUnits: loadedUnits,
      });
      setSelectedBusinessId((current) =>
        loadedBusinesses.some((business) => business.id === current)
          ? current
          : "",
      );
      loadTeamWorkspace()
        .then(setTeamWorkspace)
        .catch(() => setTeamWorkspace(null));
    } catch (requestError) {
      setError(apiErrorMessage(requestError, t("businesses.loadError")));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const refresh = () => void loadPage();
    void loadPage();
    window.addEventListener(BUSINESS_WORKSPACE_CHANGE_EVENT, refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener(BUSINESS_WORKSPACE_CHANGE_EVENT, refresh);
      window.removeEventListener("online", refresh);
    };
  }, [loadPage]);

  const selectedBusiness = businesses.find(
    (business) => business.id === selectedBusinessId,
  );

  const submitBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const name = businessForm.name.trim();
    if (name.length < 2) {
      setError(t("businesses.nameRequired"));
      return;
    }

    setIsSaving(true);
    try {
      const business = await createBusiness({
        name,
        businessType: businessForm.businessType.trim(),
        country: businessForm.country.trim(),
        currency: businessForm.currency.trim().toUpperCase(),
      });
      setBusinesses((current) => [...current, business]);
      setExpandedBusinessIds((current) => new Set(current).add(business.id));
      setBusinessForm(initialBusinessForm);
      setIsBusinessFormOpen(false);
      setSelectedBusinessId(business.id);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, t("businesses.createError")));
    } finally {
      setIsSaving(false);
    }
  };

  const submitUnit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBusiness) return;
    setError("");
    if (unitForm.name.trim().length < 2) {
      setError(
        t("businesses.unitNameRequired", {
          defaultValue:
            "Enter a business unit name with at least 2 characters.",
        }),
      );
      return;
    }

    setIsSaving(true);
    try {
      const unit = await createBusinessUnit(selectedBusiness.id, {
        name: unitForm.name.trim(),
        unitType: unitForm.unitType,
        location: unitForm.location.trim(),
      });
      setBusinessUnits((current) => [...current, unit]);
      setTeamWorkspace((current) =>
        current
          ? {
              ...current,
              business_units: [
                ...current.business_units,
                { id: unit.id, business_id: unit.businessId, name: unit.name },
              ],
            }
          : current,
      );
      setUnitForm(initialUnitForm);
      setIsUnitFormOpen(false);
    } catch (requestError) {
      setError(
        apiErrorMessage(
          requestError,
          t("businesses.unitCreateError", {
            defaultValue: "The business unit could not be created.",
          }),
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const selectBusiness = (businessId: string) => {
    setSelectedBusinessId(businessId);
    setIsUnitFormOpen(false);
    setError("");
  };

  const openCreateEmployee = (businessId?: string) => {
    const query = new URLSearchParams({ invite: "1" });
    if (businessId) query.set("business", businessId);
    navigate(`/team?${query.toString()}`);
  };

  const toggleExpanded = (
    id: string,
    setter: typeof setExpandedBusinessIds,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("businesses.eyebrow")}</span>
          <h2>{t("businesses.title")}</h2>
          <DevOnly>
            <p>{t("businesses.description")}</p>
          </DevOnly>
        </div>
        <div className="dashboard-heading-action business-heading-actions">
          <button
            className="secondary-btn"
            type="button"
            onClick={() => openCreateEmployee()}
          >
            {t("businesses.addEmployee", { defaultValue: "Add employee" })}
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={() => setIsBusinessFormOpen((open) => !open)}
          >
            {isBusinessFormOpen
              ? t("common.cancel")
              : t("businesses.createBusiness")}
          </button>
        </div>
      </div>

      {isBusinessFormOpen && (
        <form
          className="form-card business-create-form"
          noValidate
          onSubmit={submitBusiness}
        >
          <header>
            <h3>{t("businesses.formTitle")}</h3>
            <small>{t("businesses.formSubtitle")}</small>
          </header>
          {error && (
            <div className="validation-summary" role="alert">
              {error}
            </div>
          )}
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="business-name">{t("businesses.name")}</label>
              <input
                id="business-name"
                maxLength={120}
                required
                value={businessForm.name}
                onChange={(event) =>
                  setBusinessForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-type">{t("businesses.type")}</label>
              <input
                id="business-type"
                maxLength={80}
                value={businessForm.businessType}
                onChange={(event) =>
                  setBusinessForm((current) => ({
                    ...current,
                    businessType: event.target.value,
                  }))
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-country">
                {t("businesses.country")}
              </label>
              <input
                id="business-country"
                maxLength={80}
                value={businessForm.country}
                onChange={(event) =>
                  setBusinessForm((current) => ({
                    ...current,
                    country: event.target.value,
                  }))
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-currency">
                {t("businesses.currency")}
              </label>
              <input
                id="business-currency"
                maxLength={3}
                required
                value={businessForm.currency}
                onChange={(event) =>
                  setBusinessForm((current) => ({
                    ...current,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
          </div>
          <div className="business-form-actions">
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setIsBusinessFormOpen(false)}
            >
              {t("common.cancel")}
            </button>
            <button className="primary-btn" type="submit" disabled={isSaving}>
              {isSaving
                ? t("businesses.creating")
                : t("businesses.createBusiness")}
            </button>
          </div>
        </form>
      )}

      {!isBusinessFormOpen && error && (
        <div className="validation-summary" role="alert">
          {error}
        </div>
      )}
      {isLoading && <p className="card-muted">{t("businesses.loading")}</p>}
      {!isLoading && businesses.length === 0 && (
        <div className="card business-empty-state">{t("businesses.empty")}</div>
      )}

      {selectedBusiness && (
        <article className="card selected-business-panel">
          <header className="selected-business-header">
            <div>
              <span className="eyebrow">
                {t("businesses.selectedBusiness", {
                  defaultValue: "Selected business",
                })}
              </span>
              <h3>{selectedBusiness.name}</h3>
              <p className="card-muted">
                {[
                  selectedBusiness.type,
                  selectedBusiness.country,
                  selectedBusiness.currency,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="dashboard-heading-action">
              <button
                className="secondary-btn"
                type="button"
                onClick={() => openCreateEmployee(selectedBusiness.id)}
              >
                {t("businesses.createEmployee", {
                  defaultValue: "Create employee",
                })}
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={() => setIsUnitFormOpen((open) => !open)}
              >
                {isUnitFormOpen
                  ? t("common.cancel")
                  : t("businesses.createUnit", {
                      defaultValue: "Create business unit",
                    })}
              </button>
            </div>
          </header>

          {isUnitFormOpen && (
            <form className="business-unit-form" onSubmit={submitUnit}>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="unit-name">
                    {t("businesses.unitName", { defaultValue: "Unit name" })}
                  </label>
                  <input
                    id="unit-name"
                    required
                    maxLength={120}
                    value={unitForm.name}
                    onChange={(event) =>
                      setUnitForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="unit-type">
                    {t("businesses.unitType", { defaultValue: "Unit type" })}
                  </label>
                  <select
                    id="unit-type"
                    value={unitForm.unitType}
                    onChange={(event) =>
                      setUnitForm((current) => ({
                        ...current,
                        unitType: event.target.value as UnitType,
                      }))
                    }
                  >
                    <option value="shop">{t("unitTypes.shop")}</option>
                    <option value="warehouse">
                      {t("unitTypes.warehouse")}
                    </option>
                    <option value="sales_desk">
                      {t("unitTypes.sales_desk")}
                    </option>
                  </select>
                </div>
                <div className="form-field full">
                  <label htmlFor="unit-location">
                    {t("businesses.unitLocation", { defaultValue: "Location" })}
                  </label>
                  <input
                    id="unit-location"
                    maxLength={160}
                    value={unitForm.location}
                    onChange={(event) =>
                      setUnitForm((current) => ({
                        ...current,
                        location: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="business-form-actions">
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving
                    ? t("businesses.creating")
                    : t("businesses.createUnit", {
                        defaultValue: "Create business unit",
                      })}
                </button>
              </div>
            </form>
          )}
        </article>
      )}

      {businesses.length > 0 && (
        <article className="table-card business-tree-card">
          <header>
            <div>
              <span className="eyebrow">{t("businesses.treeEyebrow")}</span>
              <h3>{t("businesses.treeTitle")}</h3>
            </div>
            <span className="badge">
              {t("businesses.businessCount", { count: businesses.length })}
            </span>
          </header>
          <div className="business-tree-scroll">
            <table className="data-table business-tree-table">
              <thead>
                <tr>
                  <th>{t("businesses.treeName")}</th>
                  <th>{t("businesses.treeType")}</th>
                  <th>{t("businesses.treeLocation")}</th>
                  <th>{t("businesses.treeTeam")}</th>
                  <th>{t("businesses.treeRevenue")}</th>
                  <th>{t("businesses.treeActions")}</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => {
                  const units = businessUnits.filter(
                    (unit) => unit.businessId === business.id,
                  );
                  const revenue = units.reduce(
                    (sum, unit) => sum + unit.todayRevenue,
                    0,
                  );
                  const scopedUnitIds = new Set(units.map((unit) => unit.id));
                  const businessTeam =
                    teamWorkspace?.members.filter(
                      (member) =>
                        member.business_id === business.id ||
                        Boolean(
                          member.business_unit_id &&
                          scopedUnitIds.has(member.business_unit_id),
                        ),
                    ) ?? [];
                  const isBusinessExpanded = expandedBusinessIds.has(
                    business.id,
                  );

                  return (
                    <Fragment key={business.id}>
                      <tr
                        className={
                          selectedBusinessId === business.id
                            ? "tree-row business-tree-row selected"
                            : "tree-row business-tree-row"
                        }
                      >
                        <td>
                          <div className="tree-name-cell tree-level-1">
                            <button
                              aria-expanded={isBusinessExpanded}
                              aria-label={
                                isBusinessExpanded
                                  ? t("businesses.collapseBusiness", {
                                      name: business.name,
                                    })
                                  : t("businesses.expandBusiness", {
                                      name: business.name,
                                    })
                              }
                              className="tree-toggle"
                              type="button"
                              onClick={() =>
                                toggleExpanded(
                                  business.id,
                                  setExpandedBusinessIds,
                                )
                              }
                            >
                              {isBusinessExpanded ? "−" : "+"}
                            </button>
                            <button
                              className="tree-primary-link"
                              type="button"
                              onClick={() => selectBusiness(business.id)}
                            >
                              {business.name}
                            </button>
                            {selectedBusinessId === business.id && (
                              <span className="badge">
                                {t("businesses.selected")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{business.type || t("businesses.business")}</td>
                        <td>{business.country || "—"}</td>
                        <td>{businessTeam.length}</td>
                        <td>
                          <strong>
                            {formatMoney(revenue, business.currency)}
                          </strong>
                        </td>
                        <td>
                          <div className="tree-actions">
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => selectBusiness(business.id)}
                            >
                              {t("businesses.manage")}
                            </button>
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => openCreateEmployee(business.id)}
                            >
                              {t("businesses.addEmployee")}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isBusinessExpanded && units.length === 0 && (
                        <tr
                          className="tree-empty-row"
                          key={`${business.id}-empty`}
                        >
                          <td colSpan={6}>
                            <span className="tree-level-2">
                              {t("businesses.noUnits")}
                            </span>
                          </td>
                        </tr>
                      )}

                      {isBusinessExpanded &&
                        units.map((unit) => {
                          const unitTeam =
                            teamWorkspace?.members.filter(
                              (member) => member.business_unit_id === unit.id,
                            ) ?? [];
                          const isUnitExpanded = expandedUnitIds.has(unit.id);
                          return (
                            <Fragment key={unit.id}>
                              <tr className="tree-row unit-tree-row">
                                <td>
                                  <div className="tree-name-cell tree-level-2">
                                    <button
                                      aria-expanded={isUnitExpanded}
                                      aria-label={
                                        isUnitExpanded
                                          ? t("businesses.collapseUnit", {
                                              name: unit.name,
                                            })
                                          : t("businesses.expandUnit", {
                                              name: unit.name,
                                            })
                                      }
                                      className="tree-toggle"
                                      disabled={unitTeam.length === 0}
                                      type="button"
                                      onClick={() =>
                                        toggleExpanded(
                                          unit.id,
                                          setExpandedUnitIds,
                                        )
                                      }
                                    >
                                      {unitTeam.length === 0
                                        ? "·"
                                        : isUnitExpanded
                                          ? "−"
                                          : "+"}
                                    </button>
                                    <strong>{unit.name}</strong>
                                  </div>
                                </td>
                                <td>{t(`unitTypes.${unit.type}`)}</td>
                                <td>{unit.location || "—"}</td>
                                <td>{unitTeam.length}</td>
                                <td>
                                  {formatMoney(
                                    unit.todayRevenue,
                                    business.currency,
                                  )}
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    type="button"
                                    onClick={() =>
                                      openCreateEmployee(business.id)
                                    }
                                  >
                                    {t("businesses.addEmployee")}
                                  </button>
                                </td>
                              </tr>

                              {isUnitExpanded &&
                                unitTeam.map((member) => (
                                  <tr
                                    className="tree-row employee-tree-row"
                                    key={member.id}
                                  >
                                    <td>
                                      <div className="tree-name-cell tree-level-3">
                                        <span
                                          className="tree-leaf"
                                          aria-hidden="true"
                                        >
                                          └
                                        </span>
                                        <button
                                          className="tree-primary-link"
                                          type="button"
                                          onClick={() =>
                                            navigate(
                                              `/team?member=${member.id}`,
                                            )
                                          }
                                        >
                                          {member.full_name}
                                        </button>
                                      </div>
                                    </td>
                                    <td>{member.role_name}</td>
                                    <td>{member.email}</td>
                                    <td>
                                      <span
                                        className={
                                          member.status === "active"
                                            ? "badge"
                                            : "badge warning"
                                        }
                                      >
                                        {member.status}
                                      </span>
                                    </td>
                                    <td>—</td>
                                    <td>
                                      <button
                                        className="text-button"
                                        type="button"
                                        onClick={() =>
                                          navigate(`/team?member=${member.id}`)
                                        }
                                      >
                                        {t("businesses.viewEmployee")}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </section>
  );
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}
