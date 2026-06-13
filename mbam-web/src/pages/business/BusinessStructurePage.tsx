import { type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { ApiClientError } from "../../services/apiClient";
import { createBusiness, listBusinesses } from "../../services/businessService";
import { loadTeamWorkspace, type TeamWorkspace } from "../../services/teamService";
import type { Business } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
import "./BusinessStructurePage.css";

const initialForm = {
  name: "",
  businessType: "retail",
  country: "",
  currency: workspace.masterAccount.currency,
};

export default function BusinessStructurePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [teamWorkspace, setTeamWorkspace] = useState<TeamWorkspace | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([listBusinesses(), loadTeamWorkspace()])
      .then(([loadedBusinesses, loadedTeam]) => {
        if (active) {
          setBusinesses(loadedBusinesses);
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

  const openBusinessEmployees = (businessId: string) => {
    navigate(`/team?business=${businessId}`);
  };

  const openMember = (event: MouseEvent<HTMLButtonElement>, memberId: string) => {
    event.stopPropagation();
    navigate(`/team?member=${memberId}`);
  };

  const handleBusinessKeyDown = (event: KeyboardEvent<HTMLElement>, businessId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openBusinessEmployees(businessId);
    }
  };

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
          const units = workspace.businessUnits.filter((unit) => unit.businessId === business.id);
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
            <article
              aria-label={`${business.name} ${t("businesses.openEmployees")}`}
              className="card clickable-business-card"
              key={business.id}
              role="button"
              tabIndex={0}
              onClick={() => openBusinessEmployees(business.id)}
              onKeyDown={(event) => handleBusinessKeyDown(event, business.id)}
            >
              <header>
                <div>
                  <h3>{business.name}</h3>
                  <p className="card-muted">{[business.type, business.country, business.currency].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="badge">{t("businesses.openEmployees")}</span>
              </header>

              <p className="card-muted" style={{ marginTop: 8 }}>
                {t("businesses.totalToday")}: {formatMoney(revenue, business.currency)} · {t("businesses.employeeCount", { count: businessTeam.length })}
              </p>

              <div className="list-stack" style={{ marginTop: 16 }}>
                {units.length === 0 && <small className="card-muted">{t("businesses.noUnits")}</small>}
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
                            <button key={member.id} className="text-button" type="button" onClick={(event) => openMember(event, member.id)}>
                              {member.fullName} · {t(`roles.${member.roleId}`)}
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
