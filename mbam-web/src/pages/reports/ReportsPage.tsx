import { workspace } from "../../data/mockWorkspace";
import { formatMoney } from "../../utils/formatters";

export default function ReportsPage() {
  const completed = workspace.transactions.filter((transaction) => transaction.status === "completed");
  const completedRevenue = completed.reduce((sum, transaction) => sum + transaction.amount, 0);
  const queued = workspace.transactions.filter((transaction) => transaction.status === "queued");

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Reports</span>
          <h2>Business insight overview</h2>
          <p>
            Reports will later respect each user’s permission scope. Master owners can see everything, business admins see one business, and shop workers see their assigned unit.
          </p>
        </div>
      </div>

      <div className="metrics-grid">
        <article className="metric-card">
          <span>Completed revenue</span>
          <strong>{formatMoney(completedRevenue, workspace.masterAccount.currency)}</strong>
          <small>{completed.length} completed records</small>
        </article>
        <article className="metric-card">
          <span>Queued amount</span>
          <strong>{formatMoney(queued.reduce((sum, transaction) => sum + transaction.amount, 0), workspace.masterAccount.currency)}</strong>
          <small>{queued.length} waiting for sync</small>
        </article>
        <article className="metric-card">
          <span>Average sale</span>
          <strong>{formatMoney(completedRevenue / Math.max(completed.length, 1), workspace.masterAccount.currency)}</strong>
          <small>Completed records only</small>
        </article>
        <article className="metric-card">
          <span>Active units</span>
          <strong>{workspace.businessUnits.length}</strong>
          <small>Across all businesses</small>
        </article>
      </div>

      <article className="card">
        <h3>Next report sections</h3>
        <div className="list-stack">
          <div className="list-item"><strong>Revenue by business</strong><span className="badge">Planned</span></div>
          <div className="list-item"><strong>Revenue by shop or unit</strong><span className="badge">Planned</span></div>
          <div className="list-item"><strong>Worker sales performance</strong><span className="badge">Planned</span></div>
          <div className="list-item"><strong>Offline sync health</strong><span className="badge warning">Important</span></div>
        </div>
      </article>
    </section>
  );
}
