import { type FormEvent, type KeyboardEvent, type MouseEvent, useCallback, useEffect, useState } from "react";
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
import { loadTeamWorkspace, type TeamWorkspace } from "../../services/teamService";
import type { Business, BusinessUnit, UnitType } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
import "./BusinessStructurePage.css";

const initialBusinessForm = {
  name: "",
  businessType: "retail",
  country: "",
  currency: workspace.masterAccount.currency,
};

const initialUnitForm: { name: string; unitType: UnitType; location: string } = {
  name: "",
  unitType: "shop",
  location: "",
};

export default function BusinessStructurePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [teamWorkspace, setTeamWorkspace] = useState<TeamWorkspace | null>(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [isBusinessFormOpen, setIsBusinessFormOpen] = useState(false);
  const [isUnitFormOpen, setIsUnitFormOpen] = useState(false);
  const [businessForm, setBusinessForm] = useState(initialBusinessForm);
  const [unitForm, setUnitForm] = useState(initialUnitForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

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

  const selectedBusiness = businesses.find((business) => business.id === selectedBusinessId);

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
      setError(t("businesses.unitNameRequired", { defaultValue: "Enter a business unit name with at least 2 characters." }));
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
      setTeamWorkspace((current) => current ? {
        ...current,
        business_units: [...current.business_units, { id: unit.id, business_id: unit.businessId, name: unit.name }],
      } : current);
      setUnitForm(initialUnitForm);
      setIsUnitFormOpen(false);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, t("businesses.unitCreateError", { defaultValue: "The business unit could not be created." })));
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

  const openMember = (event: MouseEvent<HTMLButtonElement>, memberId: string) => {
    event.stopPropagation();
    navigate(`/team?member=${memberId}`);
  };

  const handleBusinessKeyDown = (event: KeyboardEvent<HTMLElement>, businessId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectBusiness(businessId);
    }
  };

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("businesses.eyebrow")}</span>
          <h2>{t("businesses.title")}</h2>
          <DevOnly><p>{t("businesses.description")}</p></DevOnly>
        </div>
        <div className="dashboard-heading-action business-heading-actions">
          <button className="secondary-btn" type="button" onClick={() => openCreateEmployee()}>
            {t("businesses.addEmployee", { defaultValue: "Add employee" })}
          </button>
          <button className="primary-btn" type="button" onClick={() => setIsBusinessFormOpen((open) => !open)}>
            {isBusinessFormOpen ? t("common.cancel") : t("businesses.createBusiness")}
          </button>
        </div>
      </div>

      {isBusinessFormOpen && (
        <form className="form-card business-create-form" noValidate onSubmit={submitBusiness}>
          <header>
            <h3>{t("businesses.formTitle")}</h3>
            <small>{t("businesses.formSubtitle")}</small>
          </header>
          {error && <div className="validation-summary" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="business-name">{t("businesses.name")}</label>
              <input id="business-name" maxLength={120} required value={businessForm.name} onChange={(event) => setBusinessForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="business-type">{t("businesses.type")}</label>
              <input id="business-type" maxLength={80} value={businessForm.businessType} onChange={(event) => setBusinessForm((current) => ({ ...current, businessType: event.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="business-country">{t("businesses.country")}</label>
              <input id="business-country" maxLength={80} value={businessForm.country} onChange={(event) => setBusinessForm((current) => ({ ...current, country: event.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="business-currency">{t("businesses.currency")}</label>
              <input id="business-currency" maxLength={3} required value={businessForm.currency} onChange={(event) => setBusinessForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
            </div>
          </div>
          <div className="business-form-actions">
            <button className="secondary-btn" type="button" onClick={() => setIsBusinessFormOpen(false)}>{t("common.cancel")}</button>
            <button className="primary-btn" type="submit" disabled={isSaving}>{isSaving ? t("businesses.creating") : t("businesses.createBusiness")}</button>
          </div>
        </form>
      )}

      {!isBusinessFormOpen && error && <div className="validation-summary" role="alert">{error}</div>}
      {isLoading && <p className="card-muted">{t("businesses.loading")}</p>}
      {!isLoading && businesses.length === 0 && <div className="card business-empty-state">{t("businesses.empty")}</div>}

      {selectedBusiness && (
        <article className="card selected-business-panel">
          <header className="selected-business-header">
            <div>
              <span className="eyebrow">{t("businesses.selectedBusiness", { defaultValue: "Selected business" })}</span>
              <h3>{selectedBusiness.name}</h3>
              <p className="card-muted">{[selectedBusiness.type, selectedBusiness.country, selectedBusiness.currency].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="dashboard-heading-action">
              <button className="secondary-btn" type="button" onClick={() => openCreateEmployee(selectedBusiness.id)}>
                {t("businesses.createEmployee", { defaultValue: "Create employee" })}
              </button>
              <button className="primary-btn" type="button" onClick={() => setIsUnitFormOpen((open) => !open)}>
                {isUnitFormOpen ? t("common.cancel") : t("businesses.createUnit", { defaultValue: "Create business unit" })}
              </button>
            </div>
          </header>

          {isUnitFormOpen && (
            <form className="business-unit-form" onSubmit={submitUnit}>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="unit-name">{t("businesses.unitName", { defaultValue: "Unit name" })}</label>
                  <input id="unit-name" required maxLength={120} value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="form-field">
                  <label htmlFor="unit-type">{t("businesses.unitType", { defaultValue: "Unit type" })}</label>
                  <select id="unit-type" value={unitForm.unitType} onChange={(event) => setUnitForm((current) => ({ ...current, unitType: event.target.value as UnitType }))}>
                    <option value="shop">{t("unitTypes.shop")}</option>
                    <option value="warehouse">{t("unitTypes.warehouse")}</option>
                    <option value="sales_desk">{t("unitTypes.sales_desk")}</option>
                  </select>
                </div>
                <div className="form-field full">
                  <label htmlFor="unit-location">{t("businesses.unitLocation", { defaultValue: "Location" })}</label>
                  <input id="unit-location" maxLength={160} value={unitForm.location} onChange={(event) => setUnitForm((current) => ({ ...current, location: event.target.value }))} />
                </div>
              </div>
              <div className="business-form-actions">
                <button className="primary-btn" type="submit" disabled={isSaving}>
                  {isSaving ? t("businesses.creating") : t("businesses.createUnit", { defaultValue: "Create business unit" })}
                </button>
              </div>
            </form>
          )}
        </article>
      )}

      <div className="card-grid two">
        {businesses.map((business) => {
          const units = businessUnits.filter((unit) => unit.businessId === business.id);
          const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);
          const scopedUnitIds = new Set(units.map((unit) => unit.id));
          const businessTeam = teamWorkspace?.members.filter((member) => member.business_id === business.id || Boolean(member.business_unit_id && scopedUnitIds.has(member.business_unit_id))) ?? [];

          return (
            <article
              aria-pressed={selectedBusinessId === business.id}
              className={selectedBusinessId === business.id ? "card clickable-business-card selected" : "card clickable-business-card"}
              key={business.id}
              role="button"
              tabIndex={0}
              onClick={() => selectBusiness(business.id)}
              onKeyDown={(event) => handleBusinessKeyDown(event, business.id)}
            >
              <header>
                <div>
                  <h3>{business.name}</h3>
                  <p className="card-muted">{[business.type, business.country, business.currency].filter(Boolean).join(" · ")}</p>
                </div>
                {selectedBusinessId === business.id && <span className="badge">{t("businesses.selected", { defaultValue: "Selected" })}</span>}
              </header>

              <p className="card-muted business-summary">
                {t("businesses.totalToday")}: {formatMoney(revenue, business.currency)} · {t("businesses.employeeCount", { count: businessTeam.length })}
              </p>

              <div className="list-stack business-unit-list">
                {units.length === 0 && <small className="card-muted">{t("businesses.noUnits")}</small>}
                {units.map((unit) => {
                  const unitTeam = teamWorkspace?.members.filter((member) => member.business_unit_id === unit.id) ?? [];
                  return (
                    <div className="list-item nested-business-unit" key={unit.id}>
                      <div>
                        <strong>{unit.name}</strong>
                        <small>{t(`unitTypes.${unit.type}`)}{unit.location ? ` · ${unit.location}` : ""}</small>
                        <div className="nested-team-list">
                          <span>{t("businesses.teamMembers")}</span>
                          {unitTeam.length > 0 ? unitTeam.map((member) => (
                            <button key={member.id} className="text-button" type="button" onClick={(event) => openMember(event, member.id)}>
                              {member.full_name} · {member.role_name}
                            </button>
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

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}
