import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedTransactions } from "../../security/accessControl";
import { listBrowserDbTransactions, type TransactionBrowserRow } from "../../services/transactions/transactionBrowserDbService";
import type { TransactionStatus } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./TransactionsPage.css";

type TransactionFilter = "all" | TransactionStatus;
type DateFilter = "all" | "today";
type SearchMode = "customer" | "employee" | "product";

function isSameUtcDay(value: string, date = new Date()): boolean {
  const parsed = new Date(value);
  return parsed.getUTCFullYear() === date.getUTCFullYear() &&
    parsed.getUTCMonth() === date.getUTCMonth() &&
    parsed.getUTCDate() === date.getUTCDate();
}

function getTransactionSearchText(transaction: TransactionBrowserRow, mode: SearchMode): string {
  if (mode === "customer") {
    return [transaction.customerName, transaction.customerContact, transaction.reference].filter(Boolean).join(" ").toLowerCase();
  }

  if (mode === "employee") {
    return [transaction.recordedBy, transaction.reference].filter(Boolean).join(" ").toLowerCase();
  }

  return [transaction.reference, transaction.productSearchText, transaction.productsLabel].filter(Boolean).join(" ").toLowerCase();
}

export default function TransactionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDateFilter = searchParams.get("date") === "today" ? "today" : "all";
  const [statusFilter, setStatusFilter] = useState<TransactionFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialDateFilter);
  const [searchMode, setSearchMode] = useState<SearchMode>("customer");
  const [searchQuery, setSearchQuery] = useState("");
  const [allTransactions, setAllTransactions] = useState<TransactionBrowserRow[]>([]);
  const currentMember = useMemo(() => getCurrentMember(), []);

  useEffect(() => {
    let ignore = false;

    async function loadTransactions() {
      const scopedWorkspaceTransactions = getScopedTransactions(currentMember);
      const transactions = await listBrowserDbTransactions(currentMember, scopedWorkspaceTransactions);
      if (!ignore) setAllTransactions(transactions);
    }

    void loadTransactions();

    return () => {
      ignore = true;
    };
  }, [currentMember]);

  const todayTransactions = allTransactions.filter((transaction) => isSameUtcDay(transaction.createdAt));
  const queuedCount = allTransactions.filter((transaction) => transaction.status === "queued").length;
  const completedCount = allTransactions.filter((transaction) => transaction.status === "completed").length;

  const updateDateFilter = (nextFilter: DateFilter) => {
    setDateFilter(nextFilter);
    setSearchParams(nextFilter === "today" ? { date: "today" } : {});
  };

  const openInvoice = (transactionId: string) => {
    navigate(`/transactions/${transactionId}/invoice`);
  };

  const handleInvoiceKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, transactionId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInvoice(transactionId);
    }
  };

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return allTransactions.filter((transaction) => {
      const statusMatches = statusFilter === "all" || transaction.status === statusFilter;
      const dateMatches = dateFilter === "all" || isSameUtcDay(transaction.createdAt);
      const searchMatches = !query || getTransactionSearchText(transaction, searchMode).includes(query);
      return statusMatches && dateMatches && searchMatches;
    });
  }, [allTransactions, dateFilter, searchMode, searchQuery, statusFilter]);

  return (
    <section className="page-grid transactions-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("transactions.eyebrow")}</span>
          <h2>{t("transactions.title")}</h2>
          <p>{t("transactions.description")}</p>
        </div>
      </div>

      <div className="metrics-grid clean-metrics-grid">
        <button className={statusFilter === "all" ? "metric-card metric-button active" : "metric-card metric-button"} type="button" onClick={() => setStatusFilter("all")}>
          <span>{t("transactions.filters.all")}</span>
          <strong>{allTransactions.length}</strong>
          <small>{t("transactions.filters.allHint")}</small>
        </button>
        <button className={statusFilter === "completed" ? "metric-card metric-button active" : "metric-card metric-button"} type="button" onClick={() => setStatusFilter("completed")}>
          <span>{t("transactions.filters.completed")}</span>
          <strong>{completedCount}</strong>
          <small>{t("transactions.filters.completedHint")}</small>
        </button>
        <button className={statusFilter === "queued" ? "metric-card metric-button active" : "metric-card metric-button"} type="button" onClick={() => setStatusFilter("queued")}>
          <span>{t("transactions.filters.queued")}</span>
          <strong>{queuedCount}</strong>
          <small>{t("transactions.filters.queuedHint")}</small>
        </button>
        <button className={dateFilter === "today" ? "metric-card metric-button active" : "metric-card metric-button"} type="button" onClick={() => updateDateFilter(dateFilter === "today" ? "all" : "today")}>
          <span>{t("transactions.filters.today")}</span>
          <strong>{todayTransactions.length}</strong>
          <small>{t("transactions.filters.todayHint")}</small>
        </button>
      </div>

      <div className="filter-bar card transaction-filter-bar">
        <div className="transaction-search-mode-toggle" role="group" aria-label={t("transactions.searchModeLabel")}>
          {(["customer", "employee", "product"] as SearchMode[]).map((mode) => (
            <button key={mode} className={searchMode === mode ? "secondary-btn active-toggle" : "secondary-btn"} type="button" onClick={() => setSearchMode(mode)}>
              {t(`transactions.searchModes.${mode}`)}
            </button>
          ))}
        </div>
        <input
          id="transaction-search"
          type="search"
          value={searchQuery}
          placeholder={t(`transactions.searchPlaceholders.${searchMode}`)}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <button className="secondary-btn" type="button">{t("transactions.print")}</button>
      </div>

      <article className="table-card transaction-table-card">
        <header>
          <h3>{t("transactions.recentRecords")}</h3>
          <small>{t("transactions.filteredRecords", { count: filteredTransactions.length })}</small>
        </header>
        <table className="data-table transaction-data-table">
          <thead>
            <tr>
              <th>{t("transactions.reference")}</th>
              <th>{t("transactions.customer")}</th>
              <th>{t("transactions.products")}</th>
              <th>{t("transactions.recordedBy")}</th>
              <th>{t("transactions.payment")}</th>
              <th>{t("transactions.status")}</th>
              <th>{t("transactions.amount")}</th>
              <th>{t("transactions.date")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="clickable-table-row"
                role="button"
                tabIndex={0}
                onClick={() => openInvoice(transaction.id)}
                onKeyDown={(event) => handleInvoiceKeyDown(event, transaction.id)}
              >
                <td><strong>{transaction.reference}</strong></td>
                <td>{transaction.customerName}</td>
                <td>{transaction.productsLabel}</td>
                <td>{transaction.recordedBy}</td>
                <td>{t(`paymentMethods.${transaction.paymentMethod}`)}</td>
                <td><span className={transaction.status === "queued" ? "badge warning" : "badge"}>{t(`common.${transaction.status}`)}</span></td>
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
