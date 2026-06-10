import { Link } from "react-router-dom";
import { workspace } from "../../data/mockWorkspace";
import { formatMoney } from "../../utils/formatters";

export default function MasterDashboard() {
  const totalRevenue = workspace.businessUnits.reduce((sum, unit) => sum + unit.todayRevenue, 0);
  const queuedTransactions = workspace.businessUnits.reduce((sum, unit) => sum + unit.queuedTransactions, 0);
  const activeTeam = workspace.teamMembers.filter((member) => member.status === "active").length;

  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Master dashboard</span>
          <h2>Control every business from one place</h2>
          <p>
            This page gives the master account owner a central view of businesses, shops, staff access, transaction activity, and offline sync status.
          </p>
        </div>
        <Link className="primary-btn" to="/transactions/new">Record transaction</Link>
      </div>

      <div className="metrics-grid">
        <article className="metric-card">
          <span>Today revenue</span>
          <strong>{formatMoney(totalRevenue, workspace.masterAccount.currency)}</strong>
          <small>Across all active units</small>
        </article>
        <article className="metric-card">
          <span>Businesses</span>
          <strong>{workspace.businesses.length}</strong>
          <small>Under master account</small>
        </article>
        <article className="metric-card">
          <span>Business units</span>
          <strong>{workspace.businessUnits.length}</strong>
          <small>Shops, desks, warehouses</small>
        </article>
        <article className="metric-card">
          <span>Queued offline records</span>
          <strong>{queuedTransactions}</strong>
          <small>{activeTeam} active team members</small>
        </article>
      </div>

      <div className="card-grid two">
        <article className="card">
          <h3>Business performance</h3>
          <div className="list-stack">
            {workspace.businesses.map((business) => {
              const units = workspace.businessUnits.filter((unit) => unit.businessId === business.id);
              const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);

              return (
                <div className="list-item" key={business.id}>
                  <div>
                    <strong>{business.name}</strong>
                    <small>{units.length} units · {business.type}</small>
                  </div>
                  <span className="badge">{formatMoney(revenue, business.currency)}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="card">
          <h3>Unit sync status</h3>
          <div className="list-stack">
            {workspace.businessUnits.map((unit) => (
              <div className="list-item" key={unit.id}>
                <div>
                  <strong>{unit.name}</strong>
                  <small>{unit.location}</small>
                </div>
                <span className={unit.queuedTransactions > 0 ? "badge warning" : "badge"}>
                  {unit.queuedTransactions > 0 ? `${unit.queuedTransactions} queued` : "Synced"}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
