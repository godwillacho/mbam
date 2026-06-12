import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { productSales } from "../../data/mockProductSales";
import { workspace } from "../../data/mockWorkspace";
import { getCurrentMember, getScopedTransactions } from "../../security/accessControl";
import { getLocalTransactionLines, listLocalTransactions } from "../../services/transactions/transactionLocalRepository";
import type { LocalTransactionLineRecord, LocalTransactionRecord } from "../../services/localSync/localSyncStore";
import type { ProductProfile, TransactionRecord, TransactionStatus } from "../../types/workspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import { getProductSearchText } from "../../utils/productDisplay";
import "./TransactionsPage.css";

type TransactionFilter = "all" | TransactionStatus;
type DateFilter = "all" | "today";
type SearchMode = "customer" | "employee" | "product";

interface TransactionTableRow extends TransactionRecord {
  productsLabel: string;
  productSearchText: string;
  source: "local" | "workspace";
  syncStatus?: LocalTransactionRecord["syncStatus"];
}

function isSameUtcDay(value: string, date = new Date()): boolean {
  const parsed = new Date(value);
  return parsed.getUTCFullYear() === date.getUTCFullYear() &&
    parsed.getUTCMonth() === date.getUTCMonth() &&
    parsed.getUTCDate() === date.getUTCDate();
}

function isProductProfile(product: ProductProfile | undefined): product is ProductProfile {
  return Boolean(product);
}

function getProductsForTransaction(transactionId: string): ProductProfile[] {
  return productSales
    .filter((sale) => sale.transactionId === transactionId)
    .map((sale) => workspace.products.find((product) => product.id === sale.productId))
    .filter(isProductProfile);
}

function getMockProductsLabel(transactionId: string): string {
  const products = getProductsForTransaction(transactionId);
  return products.length > 0 ? products.map((product) => product.name).join(", ") : "—";
}

function getMockProductSearchText(transactionId: string): string {
  return getProductsForTransaction(transactionId).map((product) => getProductSearchText(product)).join(" ");
}

function localLinesToProductsLabel(lines: LocalTransactionLineRecord[]): string {
  return lines.length > 0 ? lines.map((line) => line.productNameSnapshot).join(", ") : "—";
}

function localLinesToProductSearchText(lines: LocalTransactionLineRecord[]): string {
  return lines.map((line) => [line.productNameSnapshot, line.skuSnapshot].filter(Boolean).join(" ")).join(" ");
}

function localTransactionToTableRow(transaction: LocalTransactionRecord, lines: LocalTransactionLineRecord[]): TransactionTableRow {
  return {
    id: transaction.localId,
    reference: transaction.reference,
    businessId: transaction.businessId,
    businessUnitId: transaction.businessUnitId,
    customerName: transaction.customerName,
    itemCount: transaction.itemCount,
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod,
    status: transaction.status,
    createdAt: transaction.createdAt,
    recordedBy: transaction.recordedBy,
    productsLabel: localLinesToProductsLabel(lines),
    productSearchText: localLinesToProductSearchText(lines),
    source: "local",
    syncStatus: transaction.syncStatus,
  };
}

function workspaceTransactionToTableRow(transaction: TransactionRecord): TransactionTableRow {
  return {
    ...transaction,
    productsLabel: getMockProductsLabel(transaction.id),
    productSearchText: getMockProductSearchText(transaction.id),
    source: "workspace",
  };
}

function getScopedLocalFilters(currentMember: ReturnType<typeof getCurrentMember>) {
  if (currentMember.scopeLevel === "unit") {
    return { businessUnitId: currentMember.businessUnitId, recordedBy: currentMember.roleId === "role-cashier" ? currentMember.fullName : undefined };
  }

  if (currentMember.scopeLevel === "business") {
    return { businessId: currentMember.businessId };
  }

  return {};
}

function getTransactionSearchText(transaction: TransactionTableRow, mode: SearchMode): string {
  if (mode === "customer") {
    const customer = workspace.customers.find((item) => item.name.toLowerCase() === transaction.customerName.toLowerCase());
    return [transaction.customerName, customer?.contact, transaction.reference].filter(Boolean).join(" ").toLowerCase();
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
  const [localTransactions, setLocalTransactions] = useState<TransactionTableRow[]>([]);
  const currentMember = getCurrentMember();
  const visibleTransactions = getScopedTransactions(currentMember).map(workspaceTransactionToTableRow);
  const allTransactions = useMemo(() => {
    const workspaceIds = new Set(visibleTransactions.map((transaction) => transaction.id));
    const localOnly = localTransactions.filter((transaction) => !transaction.syncStatus || !transaction.id || !workspaceIds.has(transaction.id));
    return [...localOnly, ...visibleTransactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [localTransactions, visibleTransactions]);
  const todayTransactions = allTransactions.filter((transaction) => isSameUtcDay(transaction.createdAt));
  const queuedCount = allTransactions.filter((transaction) => transaction.status === "queued").length;
  const completedCount = allTransactions.filter((transaction) => transaction.status === "completed").length;

  useEffect(() => {
    let ignore = false;

    async function loadLocalTransactions() {
      const localRecords = await listLocalTransactions(getScopedLocalFilters(currentMember));
      const tableRows = await Promise.all(localRecords.map(async (transaction) => {
        const lines = await getLocalTransactionLines(transaction.localId);
        return localTransactionToTableRow(transaction, lines);
      }));

      if (!ignore) {
        setLocalTransactions(tableRows);
      }
    }

    void loadLocalTransactions();

    return () => {
      ignore = true;
    };
  }, [currentMember.businessId, currentMember.businessUnitId, currentMember.fullName, currentMember.id, currentMember.roleId, currentMember.scopeLevel]);

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
