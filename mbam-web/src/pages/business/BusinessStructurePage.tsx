import { type FormEvent, type MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { ApiClientError } from "../../services/apiClient";
import {
  createBusiness,
  createBusinessUnit,
  listBusinesses,
  listBusinessUnits,
} from "../../services/businessService";
import { loadTeamWorkspace, type TeamWorkspace } from "../../services/teamService";
import type { Business, BusinessUnit, UnitType } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
import "./BusinessStructurePage.css";

const initialForm = {
  name: "",
  businessType: "retail",
  country: "",
  currency: workspace.masterAccount.currency,
};

const initialUnitForm = {
  name: "",
  unitType: "shop" as UnitType,
  location: "",
};

export default function BusinessStructurePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [teamWorkspace, setTeamWorkspace] = useState<TeamWorkspace | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [unitBusinessId, setUnitBusinessId] = useState("");
  const [unitForm, setUnitForm] = useState(initialUnitForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([listBusinesses(), loadTeamWorkspace()])
      .then(async ([loadedBusinesses, loadedTeam]) => {
        const loadedUnits = (
          await Promise.all(loadedBusinesses.map((business) => listBusinessUnits(business.id)))
        ).flat();
        if (active) {
          setBusinesses(loadedBusinesses);
          setBusinessUnits(loadedUnits);
          setTeamWorkspace(loadedTeam);
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(apiErrorMessage(requestError, t("businesses.loadError")));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  const submitBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    if (name.length < 2) {
      setError(t("businesses.nameRequired"));
      return;
    }

    setIsSaving(true);
    try {
      const business = await createBusiness({
        name,
        businessType: form.businessType.trim(),
        country: form.country.trim(),
        currency: form.currency.trim().toUpperCase(),
      });
      setBusinesses((current) => [...current, business]);
      setForm(initialForm);
      setIsFormOpen(false);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, t("businesses.createError")));
    } finally {
      setIsSaving(false);
    }
  };

  const submitBusinessUnit = async (
    event: FormEvent<HTMLFormElement>,
    businessId: string,
  ) => {
    event.preventDefault();
    setError("");
    if (unitForm.name.trim().length < 2) {
      setError(t("businesses.unitNameRequired"));
      return;
    }
    setIsSaving(true);
    try {
      const unit = await createBusinessUnit(businessId, {
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
      setUnitBusinessId("");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, t("businesses.unitCreateError")));
    } finally {
      setIsSaving(false);
    }
  };

  const openMember = (event: MouseEvent<HTMLButtonElement>, memberId: string) => {
    event.stopPropagation();
    navigate(`/team?member=${memberId}`);
  };

  const openBusinessEmployees = (businessId: string, invite = false) =>
    navigate(`/team?business=${businessId}${invite ? "&invite=1" : ""}`);

  const recordBusinessSale = (businessId: string) =>
    navigate(`/transactions/new?business=${businessId}`);

  return (
    <section className="page-grid">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("businesses.eyebrow")}</span>
          <h2>{t("businesses.title")}</h2>
          <p>{t("businesses.description")}</p>
        </div>
        <div className="dashboard-heading-action">
          <button className="primary-btn" type="button" onClick={() => setIsFormOpen((open) => !open)}>
            {isFormOpen ? t("common.cancel") : t("businesses.createBusiness")}
          </button>
        </div>
      </div>

      {isFormOpen && (
        <form className="form-card business-create-form" noValidate onSubmit={submitBusiness}>
          <header>
            <h3>{t("businesses.formTitle")}</h3>
            <small>{t("businesses.formSubtitle")}</small>
          </header>
          {error && <div className="validation-summary" role="alert">{error}</div>}
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="business-name">{t("businesses.name")}</label>
              <input
                id="business-name"
                maxLength={120}
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-type">{t("businesses.type")}</label>
              <input
                id="business-type"
                maxLength={80}
                value={form.businessType}
                onChange={(event) => setForm((current) => ({ ...current, businessType: event.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-country">{t("businesses.country")}</label>
              <input
                id="business-country"
                maxLength={80}
                value={form.country}
                onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="business-currency">{t("businesses.currency")}</label>
              <input
                id="business-currency"
                maxLength={3}
                required
                value={form.currency}
                onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
              />
            </div>
          </div>
          <div className="business-form-actions">
            <button className="secondary-btn" type="button" onClick={() => setIsFormOpen(false)}>
              {t("common.cancel")}
            </button>
            <button className="primary-btn" type="submit" disabled={isSaving}>
              {isSaving ? t("businesses.creating") : t("businesses.createBusiness")}
            </button>
          </div>
        </form>
      )}

      {!isFormOpen && error && <div className="validation-summary" role="alert">{error}</div>}
      {isLoading && <p className="card-muted">{t("businesses.loading")}</p>}
      {!isLoading && businesses.length === 0 && <div className="card business-empty-state">{t("businesses.empty")}</div>}

      <div className="card-grid two">
        {businesses.map((business) => {
          const units = businessUnits.filter((unit) => unit.businessId === business.id);
          const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);
          const scopedUnitIds = new Set(
            teamWorkspace?.business_units
              .filter((unit) => unit.business_id === business.id)
              .map((unit) => unit.id) ?? [],
          );
          const businessTeam =
            teamWorkspace?.members.filter(
              (member) =>
                member.business_id === business.id ||
                (member.business_unit_id && scopedUnitIds.has(member.business_unit_id)),
            ) ?? [];

          return (
            <article className="card business-management-card" key={business.id}>
              <header>
                <div>
                  <h3>{business.name}</h3>
                  <p className="card-muted">{[business.type, business.country, business.currency].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="badge">{units.length} {t("businesses.units")}</span>
              </header>

              <div className="business-card-actions">
                <button className="primary-btn" type="button" onClick={() => recordBusinessSale(business.id)}>
                  {t("businesses.recordSale")}
                </button>
                <button className="secondary-btn" type="button" onClick={() => {
                  setUnitBusinessId((current) => current === business.id ? "" : business.id);
                  setUnitForm(initialUnitForm);
                }}>
                  {t("businesses.addUnit")}
                </button>
                <button className="secondary-btn" type="button" onClick={() => openBusinessEmployees(business.id, true)}>
                  {t("businesses.addEmployee")}
                </button>
                <button className="text-button" type="button" onClick={() => openBusinessEmployees(business.id)}>
                  {t("businesses.manageEmployees")}
                </button>
              </div>

              {unitBusinessId === business.id && (
                <form className="business-unit-form" onSubmit={(event) => submitBusinessUnit(event, business.id)}>
                  <div className="form-field">
                    <label htmlFor={`unit-name-${business.id}`}>{t("businesses.unitName")}</label>
                    <input
                      id={`unit-name-${business.id}`}
                      required
                      value={unitForm.name}
                      onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`unit-type-${business.id}`}>{t("businesses.unitType")}</label>
                    <select
                      id={`unit-type-${business.id}`}
                      value={unitForm.unitType}
                      onChange={(event) => setUnitForm((current) => ({ ...current, unitType: event.target.value as UnitType }))}
                    >
                      <option value="shop">{t("unitTypes.shop")}</option>
                      <option value="warehouse">{t("unitTypes.warehouse")}</option>
                      <option value="sales_desk">{t("unitTypes.sales_desk")}</option>
                    </select>
                  </div>
                  <div className="form-field full">
                    <label htmlFor={`unit-location-${business.id}`}>{t("businesses.unitLocation")}</label>
                    <input
                      id={`unit-location-${business.id}`}
                      value={unitForm.location}
                      onChange={(event) => setUnitForm((current) => ({ ...current, location: event.target.value }))}
                    />
                  </div>
                  <button className="primary-btn" disabled={isSaving} type="submit">
                    {t("businesses.createUnit")}
                  </button>
                </form>
              )}

              <p className="card-muted" style={{ marginTop: 8 }}>
                {t("businesses.totalToday")}: {formatMoney(revenue, business.currency)} · {t("businesses.employeeCount", { count: businessTeam.length })}
              </p>

              <div className="list-stack" style={{ marginTop: 16 }}>
                {units.length === 0 && <small className="card-muted">{t("businesses.noUnits")}</small>}
                {units.map((unit) => {
                  const unitTeam = teamWorkspace?.members.filter((member) => member.business_unit_id === unit.id) ?? [];

                  return (
                    <div className="list-item nested-business-unit" key={unit.id}>
                      <div>
                        <strong>{unit.name}</strong>
                        <small>{t(`unitTypes.${unit.type}`)} · {unit.location}</small>
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
