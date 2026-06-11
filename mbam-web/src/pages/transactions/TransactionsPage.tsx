import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedTransactions } from "../../security/accessControl";
import type { TransactionStatus } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";

type TransactionFilter = "all" | TransactionStatus;

export default function TransactionsPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<TransactionFilter>("all");
  const currentMember = getCurrentMember();
  const visibleTransactions = getScopedTransactions(currentMember);
  const queuedCount = visibleTransactions.filter((transaction) => transaction.status === "queued").length;
  const completedCount = visibleTransactions.filter((transaction) => transaction.status === "completed").length;

  const filteredTransactions = useMemo(() => {
    if (statusFilter === "all") return visibleTransactions;
    return visibleTransactions.filter((transaction) => transaction.status === statusFilter);
  }, [statusFilter, visibleTransactions]);

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("transactions.eyebrow")}</span>
          <h2>{t("transactions.title")}</h2>
          <p>{t("transactions.description")}</p>
        </div>
      </div>

      <div className="metrics-grid clean-metrics-grid">
        <button
          className={statusFilter === "all" ? "metric-card metric-button active" : "metric-card metric-button"}
          type="button"
          onClick={() => setStatusFilter("all")}
        >
          <span>{t("transactions.filters.all")}</span>
          <strong>{visibleTransactions.length}</strong>
          <small>{t("transactions.filters.allHint")}</small>
        </button>
        <button
          className={statusFilter === "completed" ? "metric-card metric-button active" : "metric-card metric-button"}
          type="button"
          onClick={() => setStatusFilter("completed")}
        >
          <span>{t("transactions.filters.completed")}</span>
          <strong>{completedCount}</strong>
          <small>{t("transactions.filters.completedHint")}</small>
        </button>
        <button
          className={statusFilter === "queued" ? "metric-card metric-button active" : "metric-card metric-button"}
          type="button"
          onClick={() => setStatusFilter("queued")}
        >
          <span>{t("transactions.filters.queued")}</span>
          <strong>{queuedCount}</strong>
          <small>{t("transactions.filters.queuedHint")}</small>
        </button>
      </div>

      <article className="table-card">
        <header>
          <h3>{t("transactions.recentRecords")}</h3>
          <small>{t("transactions.filteredRecords", { count: filteredTransactions.length })}</small>
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
            {filteredTransactions.map((transaction) => (
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
