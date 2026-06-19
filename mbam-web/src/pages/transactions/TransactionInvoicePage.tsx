import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevOnly from "../../components/app/DevOnly";
import { workspace } from "../../data/mockWorkspace";
import { getLocalTransactionInvoice } from "../../services/transactions/transactionLocalRepository";
import { getCloudTransaction } from "../../services/transactionService";
import type { PaymentMethod, TransactionStatus } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./TransactionsPage.css";

interface InvoiceLineView {
  id: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface InvoiceView {
  reference: string;
  businessId: string;
  businessUnitId?: string;
  customerName: string;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  recordedBy: string;
  total: number;
  lines: InvoiceLineView[];
}

export default function TransactionInvoicePage() {
  const { transactionId } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<InvoiceView | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadInvoice() {
      if (!transactionId) {
        setIsLoading(false);
        return;
      }

      const localInvoice = await getLocalTransactionInvoice(transactionId);
      if (ignore) return;

      if (localInvoice) {
        setInvoice({
          reference: localInvoice.transaction.reference,
          businessId: localInvoice.transaction.businessId,
          businessUnitId: localInvoice.transaction.businessUnitId,
          customerName: localInvoice.transaction.customerName,
          paymentMethod: localInvoice.transaction.paymentMethod,
          status: localInvoice.transaction.status,
          createdAt: localInvoice.transaction.createdAt,
          recordedBy: localInvoice.transaction.recordedBy,
          total: localInvoice.total,
          lines: localInvoice.lines.map((line) => ({
            id: line.localLineId,
            name: line.productNameSnapshot,
            sku: line.skuSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        });
      } else {
        try {
          const cloudInvoice = await getCloudTransaction(transactionId);
          setInvoice({
            reference: cloudInvoice.id.slice(0, 8).toUpperCase(),
            businessId: cloudInvoice.businessId,
            businessUnitId: cloudInvoice.businessUnitId,
            customerName: cloudInvoice.customerName,
            paymentMethod: cloudInvoice.paymentMethod,
            status: cloudInvoice.status,
            createdAt: cloudInvoice.createdAt,
            recordedBy: cloudInvoice.recordedBy,
            total: cloudInvoice.totalAmount,
            lines: cloudInvoice.lines.map((line) => ({
              id: line.id,
              name: line.productNameSnapshot,
              sku: line.skuSnapshot,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })),
          });
        } catch {
          setInvoice(undefined);
          setLoadError(true);
        }
      }

      setIsLoading(false);
    }

    void loadInvoice();

    return () => {
      ignore = true;
    };
  }, [transactionId]);

  useEffect(() => {
    if (!invoice || searchParams.get("print") !== "1") return;
    const printHandle = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(printHandle);
  }, [invoice, searchParams]);

  if (isLoading) {
    return <p className="card-muted">{t("productRevenue.loading")}</p>;
  }

  if (loadError) {
    return (
      <section className="page-grid">
        <div className="validation-summary" role="alert">
          This transaction is unavailable or outside your current authorization.
        </div>
        <Link className="secondary-btn" to="/transactions">
          Return to transactions
        </Link>
      </section>
    );
  }

  if (!invoice) {
    return <Navigate to="/transactions" replace />;
  }

  const business = workspace.businesses.find((item) => item.id === invoice.businessId);
  const unit = workspace.businessUnits.find((item) => item.id === invoice.businessUnitId);
  const currency = business?.currency ?? workspace.masterAccount.currency;
  const workspaceName = workspace.masterAccount.name || t("app.defaultWorkspaceName");

  return (
    <section className="page-grid invoice-page">
      <div className="page-heading clean-dashboard-heading no-print">
        <div>
          <span className="eyebrow">{t("invoice.eyebrow")}</span>
          <h2>{invoice.reference}</h2>
          <DevOnly><p>{t("invoice.description")}</p></DevOnly>
        </div>
        <div className="dashboard-heading-action">
          <Link className="secondary-btn" to="/transactions">{t("invoice.backToTransactions")}</Link>
          <button className="primary-btn" type="button" onClick={() => window.print()}>{t("invoice.printInvoice")}</button>
        </div>
      </div>

      <article className="card invoice-card">
        <header className="invoice-header">
          <div>
            <span className="eyebrow">Mbam</span>
            <h3>{business?.name ?? workspaceName}</h3>
            <p className="card-muted">{unit?.name ?? workspaceName}</p>
          </div>
          <div className="invoice-meta">
            <strong>{invoice.reference}</strong>
            <small>{formatDateTime(invoice.createdAt)}</small>
            <small>{t("transactions.recordedBy")}: {invoice.recordedBy}</small>
          </div>
        </header>

        <div className="invoice-party-grid">
          <div>
            <span className="eyebrow">{t("invoice.customer")}</span>
            <strong>{invoice.customerName}</strong>
          </div>
          <div>
            <span className="eyebrow">{t("transactions.payment")}</span>
            <strong>{t(`paymentMethods.${invoice.paymentMethod}`)}</strong>
          </div>
          <div>
            <span className="eyebrow">{t("transactions.status")}</span>
            <strong>{t(`common.${invoice.status}`)}</strong>
          </div>
        </div>

        <table className="data-table invoice-table">
          <thead>
            <tr>
              <th>{t("invoice.item")}</th>
              <th>{t("invoice.quantity")}</th>
              <th>{t("invoice.unitPrice")}</th>
              <th>{t("invoice.lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td><strong>{line.name === "transaction-total" ? t("invoice.transactionTotal") : line.name}</strong><small>{line.sku ?? "—"}</small></td>
                <td>{line.quantity}</td>
                <td>{formatMoney(line.unitPrice, currency)}</td>
                <td>{formatMoney(line.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="invoice-total-panel">
          <span>{t("invoice.total")}</span>
          <strong>{formatMoney(invoice.total, currency)}</strong>
        </footer>
      </article>
    </section>
  );
}
