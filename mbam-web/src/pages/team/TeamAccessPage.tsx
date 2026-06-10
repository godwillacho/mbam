import { workspace } from "../../data/mockWorkspace";

function resolveRole(roleId: string) {
  return workspace.roles.find((role) => role.id === roleId)?.name ?? "Unknown role";
}

function resolveScope(memberBusinessId?: string, memberUnitId?: string) {
  if (memberUnitId) return workspace.businessUnits.find((unit) => unit.id === memberUnitId)?.name ?? "Unknown unit";
  if (memberBusinessId) return workspace.businesses.find((business) => business.id === memberBusinessId)?.name ?? "Unknown business";
  return "Entire master account";
}

export default function TeamAccessPage() {
  return (
    <section className="page-grid">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Team access</span>
          <h2>Roles and scoped permissions</h2>
          <p>
            This page represents how master owners invite workers and assign access to the whole account, one business, or one shop.
          </p>
        </div>
        <button className="primary-btn" type="button">Invite worker</button>
      </div>

      <article className="table-card">
        <header>
          <h3>Members</h3>
          <small>Access is scoped by master account, business, or unit.</small>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Scope</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {workspace.teamMembers.map((member) => (
              <tr key={member.id}>
                <td>{member.fullName}</td>
                <td>{member.email}</td>
                <td>{resolveRole(member.roleId)}</td>
                <td>{resolveScope(member.businessId, member.businessUnitId)}</td>
                <td>
                  <span className={member.status === "invited" ? "badge warning" : "badge"}>{member.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <div className="card-grid two">
        {workspace.roles.map((role) => (
          <article className="card" key={role.id}>
            <h3>{role.name}</h3>
            <div className="list-stack">
              {role.permissions.map((permission) => (
                <div className="list-item" key={permission}>
                  <strong>{permission}</strong>
                  <span className="badge">Permission</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
