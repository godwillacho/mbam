import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { canViewDashboardMetric, getStoredDashboardMember } from "./dashboardPermissions";
import "./PendingPaymentsPage.css";

function formatOptionalDate(value?: string): string {
  return value ? formatDateTime(value) : "—";
}

function findCustomer(customerId: string) {
  return workspace.customers.find((customer) => customer.id === customerId);
}

function findBusiness(businessId: string) {
  return workspace.businesses.find((business) => business.id === businessId);
}

function findUnit(unitId: string) {
  return workspace.businessUnits.find((unit) => unit.id === unitId);
}

function getScopedBusinessIds() {
  const member = getStoredDashboardMember();

  if (member.scopeLevel === "master") {
    return new Set(workspace.businesses.map((business) => business.id));
  }

  if (member.businessId) {
    return new Set([member.businessId]);
  }

  const unit = findUnit(member.businessUnitId ?? "");
  return unit ? new Set([unit.businessId]) : new Set<string>();
}

export default function PendingPaymentsPage() {
  const { t } = useTranslation();
  const member = getStoredDashboardMember();

  if (!canViewDashboardMetric(member, "pendingCustomers")) {
    return <Navigate to="/dashboard" replace />;
  }

  const scopedBusinessIds = getScopedBusinessIds();
  const visiblePendingPayments = workspace.pendingPayments.filter((payment) => scopedBusinessIds.has(payment.businessId));
  const totalOutstanding = visiblePendingPayments.reduce((sum, payment) => sum + payment.outstandingAmount, 0);
  const totalOriginal = visiblePendingPayments.reduce((sum, payment) => sum + payment.originalAmount, 0);
  const totalPaid = visiblePendingPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);

  return (
    <section className="page-grid pending-payments-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("pendingPayments.eyebrow")}</span>
          <h2>{t("pendingPayments.title")}</h2>
          <p>{t("pendingPayments.description")}</p>
        </div>
        <Link className="secondary-btn" to="/dashboard">{t("pendingPayments.backToDashboard")}</Link>
      </div>

      <div className="metrics-grid clean-metrics-grid">
        <article className="metric-card">
          <span>{t("pendingPayments.totalOutstanding")}</span>
          <strong>{formatMoney(totalOutstanding, workspace.masterAccount.currency)}</strong>
          <small>{t("pendingPayments.totalOutstandingHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("pendingPayments.originalAmount")}</span>
          <strong>{formatMoney(totalOriginal, workspace.masterAccount.currency)}</strong>
          <small>{t("pendingPayments.originalAmountHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("pendingPayments.amountPaid")}</span>
          <strong>{formatMoney(totalPaid, workspace.masterAccount.currency)}</strong>
          <small>{t("pendingPayments.amountPaidHint")}</small>
        </article>
        <article className="metric-card">
          <span>{t("pendingPayments.records")}</span>
          <strong>{visiblePendingPayments.length}</strong>
          <small>{t("pendingPayments.recordsHint")}</small>
        </article>
      </div>

      <article className="card pending-full-report-card">
        <header>
          <div>
            <span className="eyebrow">{t("pendingPayments.fullReport")}</span>
            <h3>{t("pendingPayments.transactionDetails")}</h3>
          </div>
        </header>

        <div className="pending-full-report">
          {visiblePendingPayments.map((payment) => {
            const customer = findCustomer(payment.customerId);
            const business = findBusiness(payment.businessId);
            const unit = findUnit(payment.businessUnitId);

            return (
              <article className="pending-full-row" key={payment.id}>
                <div className="pending-full-main">
                  <strong>{payment.reference}</strong>
                  <small>{customer?.name ?? t("pendingPayments.unknownCustomer")} · {customer?.contact ?? t("transactionRecord.noContactSaved")}</small>
                </div>

                <dl className="pending-full-grid">
                  <div>
                    <dt>{t("pendingPayments.business")}</dt>
                    <dd>{business?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.unit")}</dt>
                    <dd>{unit?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.originalAmount")}</dt>
                    <dd>{formatMoney(payment.originalAmount, business?.currency ?? workspace.masterAccount.currency)}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.amountPaid")}</dt>
                    <dd>{formatMoney(payment.amountPaid, business?.currency ?? workspace.masterAccount.currency)}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.outstandingAmount")}</dt>
                    <dd>{formatMoney(payment.outstandingAmount, business?.currency ?? workspace.masterAccount.currency)}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.paymentMethod")}</dt>
                    <dd>{t(`paymentMethods.${payment.paymentMethod}`)}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.saleDate")}</dt>
                    <dd>{formatDateTime(payment.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.lastPayment")}</dt>
                    <dd>{formatOptionalDate(payment.lastPaymentAt)}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.paymentDate")}</dt>
                    <dd>{payment.paymentDate ? formatOptionalDate(payment.paymentDate) : t("pendingPayments.noPaymentDate")}</dd>
                  </div>
                  <div>
                    <dt>{t("pendingPayments.recordedBy")}</dt>
                    <dd>{payment.recordedBy}</dd>
                  </div>
                </dl>

                {payment.note && <p className="pending-note">{payment.note}</p>}
              </article>
            );
          })}
        </div>
      </article>
    </section>
  );
}
