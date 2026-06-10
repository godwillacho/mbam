import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";

export default function TransactionsPage() {
  const { t } = useTranslation();

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("transactions.eyebrow")}</span>
          <h2>{t("transactions.title")}</h2>
          <p>{t("transactions.description")}</p>
        </div>
      </div>

      <article className="table-card">
        <header>
          <h3>{t("transactions.recentRecords")}</h3>
          <small>{t("transactions.demoTransactions", { count: workspace.transactions.length })}</small>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("transactions.reference")}</th>
              <th>{t("transactions.customer")}</th>
              <th>{t("transactions.recordedBy")}</th>
              <th>{t("transactions.payment")}</th>
              <th>{t("transactions.status")}</th>
              <th>{t("transactions.amount")}</th>
              <th>{t("transactions.date")}</th>
            </tr>
          </thead>
          <tbody>
            {workspace.transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.reference}</td>
                <td>{transaction.customerName}</td>
                <td>{transaction.recordedBy}</td>
                <td>{t(`paymentMethods.${transaction.paymentMethod}`)}</td>
                <td>
                  <span className={transaction.status === "queued" ? "badge warning" : "badge"}>
                    {t(`common.${transaction.status}`)}
                  </span>
                </td>
                <td>{formatMoney(transaction.amount, workspace.masterAccount.currency)}</td>
                <td>{formatDateTime(transaction.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
