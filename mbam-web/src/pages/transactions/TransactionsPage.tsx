import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedTransactions } from "../../security/accessControl";
import type { TransactionRecord, TransactionStatus } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { getProductSearchText } from "../../utils/productDisplay";

type TransactionFilter = "all" | TransactionStatus;
type DateFilter = "all" | "today";

function isSameUtcDay(value: string, date = new Date()): boolean {
  const parsed = new Date(value);
  return parsed.getUTCFullYear() === date.getUTCFullYear() &&
    parsed.getUTCMonth() === date.getUTCMonth() &&
    parsed.getUTCDate() === date.getUTCDate();
}

function getProductsForTransaction(transactionId: string) {
  return productSales
    .filter((sale) => sale.transactionId === transactionId)
    .map((sale) => workspace.products.find((product) => product.id === sale.productId))
    .filter(Boolean);
}

function getTransactionSearchText(transaction: TransactionRecord): string {
  const products = getProductsForTransaction(transaction.id);
  const unit = workspace.businessUnits.find((item) => item.id === transaction.businessUnitId);
  const business = workspace.businesses.find((item) => item.id === transaction.businessId);
  const customer = workspace.customers.find((item) => item.name.toLowerCase() === transaction.customerName.toLowerCase());

  return [
    transaction.reference,
    transaction.customerName,
    customer?.contact,
    transaction.recordedBy,
    transaction.paymentMethod,
    transaction.status,
    transaction.createdAt,
    unit?.name,
    business?.name,
    ...products.map((product) => product ? getProductSearchText(product) : ""),
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function TransactionsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDateFilter = searchParams.get("date") === "today" ? "today" : "all";
  const [statusFilter, setStatusFilter] = useState<TransactionFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialDateFilter);
  const [searchQuery, setSearchQuery] = useState("");
  const currentMember = getCurrentMember();
  const visibleTransactions = getScopedTransactions(currentMember);
  const todayTransactions = visibleTransactions.filter((transaction) => isSameUtcDay(transaction.createdAt));
  const queuedCount = visibleTransactions.filter((transaction) => transaction.status === "queued").length;
  const completedCount = visibleTransactions.filter((transaction) => transaction.status === "completed").length;

  const updateDateFilter = (nextFilter: DateFilter) => {
    setDateFilter(nextFilter);
    setSearchParams(nextFilter === "today" ? { date: "today" } : {});
  };

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return visibleTransactions.filter((transaction) => {
      const statusMatches = statusFilter === "all" || transaction.status === statusFilter;
      const dateMatches = dateFilter === "all" || isSameUtcDay(transaction.createdAt);
      const searchMatches = !query || getTransactionSearchText(transaction).includes(query);
      return statusMatches && dateMatches && searchMatches;
    });
  }, [dateFilter, searchQuery, statusFilter, visibleTransactions]);

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
        <button className={statusFilter === "all" ? "metric-card metric-button active" : "metric-card metric-button"} type="button" onClick={() => setStatusFilter("all")}>
          <span>{t("transactions.filters.all")}</span>
          <strong>{visibleTransactions.length}</strong>
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

      <div className="filter-bar card">
        <label htmlFor="transaction-search">{t("transactions.searchLabel")}</label>
        <input
          id="transaction-search"
          type="search"
          value={searchQuery}
          placeholder={t("transactions.searchPlaceholder")}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <small>{t("transactions.searchHint")}</small>
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
              <th>{t("transactions.products")}</th>
              <th>{t("transactions.recordedBy")}</th>
              <th>{t("transactions.payment")}</th>
              <th>{t("transactions.status")}</th>
              <th>{t("transactions.amount")}</th>
              <th>{t("transactions.date")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => {
              const products = getProductsForTransaction(transaction.id);

              return (
                <tr key={transaction.id}>
                  <td>{transaction.reference}</td>
                  <td>{transaction.customerName}</td>
                  <td>{products.length > 0 ? products.map((product) => product?.name).join(", ") : "—"}</td>
                  <td>{transaction.recordedBy}</td>
                  <td>{t(`paymentMethods.${transaction.paymentMethod}`)}</td>
                  <td>
                    <span className={transaction.status === "queued" ? "badge warning" : "badge"}>{t(`common.${transaction.status}`)}</span>
                  </td>
                  <td>{formatMoney(transaction.amount, workspace.masterAccount.currency)}</td>
                  <td>{formatDateTime(transaction.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </section>
  );
}
