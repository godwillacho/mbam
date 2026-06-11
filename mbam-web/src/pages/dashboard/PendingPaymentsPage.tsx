import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getScopedPendingPayments } from "../../security/accessControl";
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

export default function PendingPaymentsPage() {
  const { t } = useTranslation();
  const member = getStoredDashboardMember();

  if (!canViewDashboardMetric(member, "pendingCustomers")) {
    return <Navigate to="/dashboard" replace />;
  }

  const visiblePendingPayments = getScopedPendingPayments(member);
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
                  <small>{business?.name ?? t("pendingPayments.business")} · {unit?.name ?? t("pendingPayments.unit")}</small>
                </div>
                <div className="pending-full-meta">
                  <span>
                    <strong>{t("pendingPayments.outstandingAmount")}</strong>
                    <small>{formatMoney(payment.outstandingAmount, business?.currency ?? workspace.masterAccount.currency)}</small>
                  </span>
                  <span>
                    <strong>{t("pendingPayments.saleDate")}</strong>
                    <small>{formatOptionalDate(payment.createdAt)}</small>
                  </span>
                  <span>
                    <strong>{t("pendingPayments.lastPayment")}</strong>
                    <small>{formatOptionalDate(payment.lastPaymentAt)}</small>
                  </span>
                  <span>
                    <strong>{t("pendingPayments.paymentDate")}</strong>
                    <small>{payment.paymentDate ? formatOptionalDate(payment.paymentDate) : t("pendingPayments.noPaymentDate")}</small>
                  </span>
                  <span>
                    <strong>{t("pendingPayments.recordedBy")}</strong>
                    <small>{payment.recordedBy}</small>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </article>
    </section>
  );
}
