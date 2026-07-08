import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { workspace } from "../../data/mockWorkspace";
import {
  deleteTransactionDraft,
  listTransactionDrafts,
  type TransactionDraft,
} from "../../services/transactions/transactionService";
import { formatDateTime, formatMoney } from "../../utils/formatters";
import "./TransactionsPage.css";

export default function TransactionDraftsPage() {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<TransactionDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listTransactionDrafts()
      .then(setDrafts)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : t("drafts.loadError")))
      .finally(() => setIsLoading(false));
  }, [t]);

  const removeDraft = async (draftId: string) => {
    setError("");
    try {
      await deleteTransactionDraft(draftId);
      setDrafts((current) => current.filter((draft) => draft.id !== draftId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("drafts.deleteError"));
    }
  };

  return (
    <section className="page-grid transactions-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{t("drafts.eyebrow")}</span>
          <h2>{t("drafts.title")}</h2>
        </div>
        <Link className="primary-btn" to="/transactions/new">{t("drafts.newTransaction")}</Link>
      </div>

      {error && <div className="validation-summary" role="alert">{error}</div>}
      {isLoading && <p className="card-muted">{t("drafts.loading")}</p>}
      {!isLoading && drafts.length === 0 && !error && (
        <article className="card">
          <h3>{t("drafts.emptyTitle")}</h3>
          <p className="card-muted">{t("drafts.emptyBody")}</p>
        </article>
      )}

      {!isLoading && drafts.length > 0 && (
        <article className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("drafts.customer")}</th>
                <th>{t("drafts.paymentStatus")}</th>
                <th>{t("drafts.total")}</th>
                <th>{t("drafts.updated")}</th>
                <th>{t("drafts.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id}>
                  <td><strong>{draft.customerName || t("drafts.unnamedCustomer")}</strong></td>
                  <td>{draft.paymentStatus === "pending" ? t("transactionRecord.pendingPayment") : t("transactionRecord.paid")}</td>
                  <td>{formatMoney(draft.totalAmount ?? 0, workspace.masterAccount.currency)}</td>
                  <td>{formatDateTime(draft.updatedAt)}</td>
                  <td>
                    <div className="dashboard-heading-action">
                      <Link className="secondary-btn" to={`/transactions/new?draft=${draft.id}`}>{t("drafts.edit")}</Link>
                      <button className="line-remove-btn" type="button" onClick={() => void removeDraft(draft.id)}>{t("drafts.delete")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}
