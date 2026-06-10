import { workspace } from "../../data/mockWorkspace";
import { formatDateTime, formatMoney } from "../../utils/formatters";

export default function TransactionsPage() {
  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Transactions</span>
          <h2>Sales history and sync queue</h2>
          <p>
            This page shows completed and queued transactions across the master account. Filters will later use the business, unit, date range, and worker scope from the backend.
          </p>
        </div>
      </div>

      <article className="table-card">
        <header>
          <h3>Recent records</h3>
          <small>{workspace.transactions.length} demo transactions</small>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Recorded by</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {workspace.transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.reference}</td>
                <td>{transaction.customerName}</td>
                <td>{transaction.recordedBy}</td>
                <td>{transaction.paymentMethod.replace("_", " ")}</td>
                <td>
                  <span className={transaction.status === "queued" ? "badge warning" : "badge"}>{transaction.status}</span>
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
