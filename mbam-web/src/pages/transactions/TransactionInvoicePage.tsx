import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedTransactions } from "../../security/accessControl";
import { getLocalTransactionInvoice } from "../../services/transactions/transactionLocalRepository";
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
  businessUnitId: string;
  customerName: string;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  recordedBy: string;
  total: number;
  lines: InvoiceLineView[];
}

function getMockInvoice(transactionId: string | undefined): InvoiceView | undefined {
  const currentMember = getCurrentMember();
  const transaction = getScopedTransactions(currentMember).find((item) => item.id === transactionId);
  if (!transaction) return undefined;

  const lines = productSales.filter((sale) => sale.transactionId === transaction.id).map((sale) => {
    const product = workspace.products.find((item) => item.id === sale.productId);
    const lineTotal = sale.quantity * sale.unitPrice;
    return {
      id: sale.id,
      name: product?.name ?? sale.productId,
      sku: product?.sku,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      lineTotal,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return {
    reference: transaction.reference,
    businessId: transaction.businessId,
    businessUnitId: transaction.businessUnitId,
    customerName: transaction.customerName,
    paymentMethod: transaction.paymentMethod,
    status: transaction.status,
    createdAt: transaction.createdAt,
    recordedBy: transaction.recordedBy,
    total: subtotal || transaction.amount,
    lines: lines.length > 0 ? lines : [{
      id: `${transaction.id}-total`,
      name: "transaction-total",
      quantity: transaction.itemCount,
      unitPrice: transaction.amount,
      lineTotal: transaction.amount,
    }],
  };
}

export default function TransactionInvoicePage() {
  const { transactionId } = useParams();
  const { t } = useTranslation();
  const [invoice, setInvoice] = useState<InvoiceView | undefined>();
  const [isLoading, setIsLoading] = useState(true);

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
        setInvoice(getMockInvoice(transactionId));
      }

      setIsLoading(false);
    }

    void loadInvoice();

    return () => {
      ignore = true;
    };
  }, [transactionId]);

  if (isLoading) {
    return <p className="card-muted">{t("productRevenue.loading")}</p>;
  }

  if (!invoice) {
    return <Navigate to="/transactions" replace />;
  }

  const business = workspace.businesses.find((item) => item.id === invoice.businessId);
  const unit = workspace.businessUnits.find((item) => item.id === invoice.businessUnitId);
  const currency = business?.currency ?? workspace.masterAccount.currency;

  return (
    <section className="page-grid invoice-page">
      <div className="page-heading clean-dashboard-heading no-print">
        <div>
          <span className="eyebrow">{t("invoice.eyebrow")}</span>
          <h2>{invoice.reference}</h2>
          <p>{t("invoice.description")}</p>
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
            <h3>{business?.name ?? workspace.masterAccount.name}</h3>
            <p className="card-muted">{unit?.name ?? workspace.masterAccount.name}</p>
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
