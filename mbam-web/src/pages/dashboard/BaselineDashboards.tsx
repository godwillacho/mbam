import { Link } from "react-router-dom";
import { workspace } from "../../data/mockWorkspace";
import {
  canAccessRoute,
  canManageProducts,
  getCurrentMember,
  getScopedTransactions,
  getScopedUnits,
} from "../../security/accessControl";
import type { TeamMember } from "../../types/workspace";
import { formatMoney } from "../../utils/formatters";
import "./MasterDashboard.css";

type BaselineKind = "master" | "business" | "shop" | "cashier";

interface BaselineDashboardProps {
  kind: BaselineKind;
}

const dashboardCopy: Record<BaselineKind, { eyebrow: string; title: string; description: string }> = {
  master: { eyebrow: "Account baseline", title: "Master owner dashboard", description: "Account-wide businesses, shops, people, products, and sales." },
  business: { eyebrow: "Business baseline", title: "Business admin dashboard", description: "Manage the assigned business and its authorized shops." },
  shop: { eyebrow: "Shop baseline", title: "Shop manager dashboard", description: "Operate the assigned shop, inventory, team, and sales." },
  cashier: { eyebrow: "Personal baseline", title: "Cashier dashboard", description: "Record sales and manage products for your assigned shop." },
};

function scopedProducts(member: TeamMember) {
  const unitIds = new Set(getScopedUnits(member).map((unit) => unit.id));
  return workspace.products.filter((product) =>
    product.businessUnitId ? unitIds.has(product.businessUnitId) : false,
  );
}

function BaselineDashboard({ kind }: BaselineDashboardProps) {
  const member = getCurrentMember();
  const units = getScopedUnits(member);
  const transactions = getScopedTransactions(member);
  const products = scopedProducts(member);
  const businessIds = new Set(units.map((unit) => unit.businessId));
  const businesses = workspace.businesses.filter((business) => businessIds.has(business.id));
  const team = workspace.teamMembers.filter((candidate) => {
    if (member.scopeLevel === "master") return true;
    if (member.scopeLevel === "business") return candidate.businessId === member.businessId;
    return candidate.businessUnitId === member.businessUnitId;
  });
  const revenue = transactions.reduce((total, transaction) => total + transaction.amount, 0);
  const currency = businesses[0]?.currency ?? workspace.masterAccount.currency;
  const copy = dashboardCopy[kind];

  const metrics: Array<[string, string | number]> = kind === "master"
    ? [["Businesses", businesses.length], ["Shops", units.length], ["Team members", team.length], ["Products", products.length]]
    : kind === "business"
      ? [["Business sales", formatMoney(revenue, currency)], ["Authorized shops", units.length], ["Team members", team.length], ["Products", products.length]]
      : kind === "shop"
        ? [["Shop sales", formatMoney(revenue, currency)], ["Transactions", transactions.length], ["Shop products", products.length], ["Shop team", team.length]]
        : [["My sales", formatMoney(revenue, currency)], ["My transactions", transactions.length], ["Shop products", products.length]];

  return (
    <section className="page-grid role-dashboard-page">
      <div className="page-heading clean-dashboard-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p className="card-muted">{copy.description}</p>
        </div>
        {canAccessRoute(member, "recordTransaction") && (
          <div className="dashboard-heading-action">
            <Link className="primary-btn" to="/transactions/new">Record transaction</Link>
          </div>
        )}
      </div>

      <article className="card role-preview-card">
        <div>
          <span className="eyebrow">Signed in as</span>
          <h3>{member.fullName}</h3>
          <p className="card-muted">
            {member.roleName ?? copy.title} · {units.map((unit) => unit.name).join(", ") || "Validated account scope"}
          </p>
        </div>
        <span className="badge">{member.status}</span>
      </article>

      <div className="metrics-grid clean-metrics-grid dashboard-options-grid">
        {metrics.map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Validated assigned scope</small>
          </article>
        ))}
      </div>

      <article className="card quick-actions-card quick-actions-below">
        <h3>{kind === "cashier" ? "Cashier tools" : "Authorized tools"}</h3>
        <div className="quick-action-list">
          {canAccessRoute(member, "recordTransaction") && <Link to="/transactions/new">Record transaction</Link>}
          {canAccessRoute(member, "transactionDrafts") && <Link to="/transactions/drafts">Transaction drafts</Link>}
          {canAccessRoute(member, "transactions") && <Link to="/transactions">Transactions</Link>}
          {canAccessRoute(member, "products") && (
            <Link to="/products">{canManageProducts(member) ? "Add or edit shop products" : "View shop products"}</Link>
          )}
          {canAccessRoute(member, "businesses") && <Link to="/businesses">Business structure</Link>}
          {canAccessRoute(member, "team") && <Link to="/team">Team access</Link>}
          {canAccessRoute(member, "reports") && <Link to="/reports">Reports</Link>}
        </div>
      </article>

      <article className="card dashboard-detail-card full-width-detail-card">
        <header>
          <div>
            <span className="eyebrow">Recent activity</span>
            <h3>{kind === "cashier" ? "My recent transactions" : "Recent scoped transactions"}</h3>
          </div>
          <span className="badge">{transactions.length}</span>
        </header>
        {transactions.length === 0 ? (
          <p className="card-muted">No transactions have been recorded in this dashboard scope.</p>
        ) : (
          <div className="list-stack summary-two-column-list">
            {transactions.slice(0, 6).map((transaction) => (
              <div className="list-item" key={transaction.id}>
                <div>
                  <strong>{transaction.reference}</strong>
                  <small>{transaction.customerName} · {transaction.recordedBy}</small>
                </div>
                <span className="badge">{formatMoney(transaction.amount, currency)}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export function MasterOwnerDashboard() {
  return <BaselineDashboard kind="master" />;
}

export function BusinessAdminDashboard() {
  return <BaselineDashboard kind="business" />;
}

export function ShopManagerDashboard() {
  return <BaselineDashboard kind="shop" />;
}

export function CashierDashboard() {
  return <BaselineDashboard kind="cashier" />;
}
