import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
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
          <DevOnly><p>{t("pendingPayments.description")}</p></DevOnly>
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

      <article className="table-card pending-full-report-card">
        <header>
          <div>
            <span className="eyebrow">{t("pendingPayments.fullReport")}</span>
            <h3>{t("pendingPayments.transactionDetails")}</h3>
          </div>
          <small>{t("transactions.filteredRecords", { count: visiblePendingPayments.length })}</small>
        </header>

        <table className="data-table pending-payments-table">
          <thead>
            <tr>
              <th>{t("transactions.reference")}</th>
              <th>{t("transactions.customer")}</th>
              <th>{t("transactionRecord.customerContact")}</th>
              <th>{t("transactionRecord.business")}</th>
              <th>{t("transactionRecord.unit")}</th>
              <th>{t("pendingPayments.originalAmount")}</th>
              <th>{t("pendingPayments.amountPaid")}</th>
              <th>{t("pendingPayments.outstandingAmount")}</th>
              <th>{t("pendingPayments.saleDate")}</th>
              <th>{t("pendingPayments.lastPayment")}</th>
              <th>{t("pendingPayments.paymentDate")}</th>
              <th>{t("pendingPayments.recordedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {visiblePendingPayments.map((payment) => {
              const customer = findCustomer(payment.customerId);
              const business = findBusiness(payment.businessId);
              const unit = findUnit(payment.businessUnitId);
              const currency = business?.currency ?? workspace.masterAccount.currency;

              return (
                <tr key={payment.id}>
                  <td><strong>{payment.reference}</strong></td>
                  <td>{customer?.name ?? t("pendingPayments.unknownCustomer")}</td>
                  <td>{customer?.contact ?? t("transactionRecord.noContactSaved")}</td>
                  <td>{business?.name ?? t("pendingPayments.business")}</td>
                  <td>{unit?.name ?? t("pendingPayments.unit")}</td>
                  <td>{formatMoney(payment.originalAmount, currency)}</td>
                  <td>{formatMoney(payment.amountPaid, currency)}</td>
                  <td><span className="badge warning">{formatMoney(payment.outstandingAmount, currency)}</span></td>
                  <td>{formatOptionalDate(payment.createdAt)}</td>
                  <td>{formatOptionalDate(payment.lastPaymentAt)}</td>
                  <td>{payment.paymentDate ? formatOptionalDate(payment.paymentDate) : t("pendingPayments.noPaymentDate")}</td>
                  <td>{payment.recordedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </section>
  );
}
