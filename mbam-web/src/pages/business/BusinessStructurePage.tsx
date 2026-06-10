import { workspace } from "../../data/mockWorkspace";
import { formatMoney } from "../../utils/formatters";

export default function BusinessStructurePage() {
  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Businesses and shops</span>
          <h2>Structure the master account</h2>
          <p>
            This design supports one master account controlling many businesses, and each business controlling many shops, branches, warehouses, or sales units.
          </p>
        </div>
        <button className="primary-btn" type="button">Create business</button>
      </div>

      <div className="card-grid two">
        {workspace.businesses.map((business) => {
          const units = workspace.businessUnits.filter((unit) => unit.businessId === business.id);
          const revenue = units.reduce((sum, unit) => sum + unit.todayRevenue, 0);

          return (
            <article className="card" key={business.id}>
              <h3>{business.name}</h3>
              <p className="card-muted">{business.type} · {business.country} · {business.currency}</p>
              <div className="list-stack">
                {units.map((unit) => (
                  <div className="list-item" key={unit.id}>
                    <div>
                      <strong>{unit.name}</strong>
                      <small>{unit.type.replace("_", " ")} · {unit.location}</small>
                    </div>
                    <span className="badge">{formatMoney(unit.todayRevenue, business.currency)}</span>
                  </div>
                ))}
              </div>
              <p className="card-muted" style={{ marginTop: 14 }}>
                Total today: {formatMoney(revenue, business.currency)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
