import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedTransactions } from "../../security/accessControl";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./TransactionsPage.css";

export default function TransactionInvoicePage() {
  const { transactionId } = useParams();
  const { t } = useTranslation();
  const currentMember = getCurrentMember();
  const transaction = getScopedTransactions(currentMember).find((item) => item.id === transactionId);

  if (!transaction) {
    return <Navigate to="/transactions" replace />;
  }

  const business = workspace.businesses.find((item) => item.id === transaction.businessId);
  const unit = workspace.businessUnits.find((item) => item.id === transaction.businessUnitId);
  const invoiceLines = productSales.filter((sale) => sale.transactionId === transaction.id).map((sale) => {
    const product = workspace.products.find((item) => item.id === sale.productId);
    const total = sale.quantity * sale.unitPrice;
    return { sale, product, total };
  });
  const subtotal = invoiceLines.reduce((sum, line) => sum + line.total, 0);
  const total = subtotal || transaction.amount;

  return (
    <section className="page-grid invoice-page">
      <div className="page-heading clean-dashboard-heading no-print">
        <div>
          <span className="eyebrow">{t("invoice.eyebrow")}</span>
          <h2>{transaction.reference}</h2>
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
            <strong>{transaction.reference}</strong>
            <small>{formatDateTime(transaction.createdAt)}</small>
            <small>{t("transactions.recordedBy")}: {transaction.recordedBy}</small>
          </div>
        </header>

        <div className="invoice-party-grid">
          <div>
            <span className="eyebrow">{t("invoice.customer")}</span>
            <strong>{transaction.customerName}</strong>
          </div>
          <div>
            <span className="eyebrow">{t("transactions.payment")}</span>
            <strong>{t(`paymentMethods.${transaction.paymentMethod}`)}</strong>
          </div>
          <div>
            <span className="eyebrow">{t("transactions.status")}</span>
            <strong>{t(`common.${transaction.status}`)}</strong>
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
            {invoiceLines.length > 0 ? invoiceLines.map(({ sale, product, total: lineTotal }) => (
              <tr key={sale.id}>
                <td><strong>{product?.name ?? sale.productId}</strong><small>{product?.sku ?? "—"}</small></td>
                <td>{sale.quantity}</td>
                <td>{formatMoney(sale.unitPrice, business?.currency ?? workspace.masterAccount.currency)}</td>
                <td>{formatMoney(lineTotal, business?.currency ?? workspace.masterAccount.currency)}</td>
              </tr>
            )) : (
              <tr>
                <td><strong>{t("invoice.transactionTotal")}</strong></td>
                <td>{transaction.itemCount}</td>
                <td>—</td>
                <td>{formatMoney(transaction.amount, business?.currency ?? workspace.masterAccount.currency)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <footer className="invoice-total-panel">
          <span>{t("invoice.total")}</span>
          <strong>{formatMoney(total, business?.currency ?? workspace.masterAccount.currency)}</strong>
        </footer>
      </article>
    </section>
  );
}
