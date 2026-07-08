# Active API Domains

Identity, sessions, OAuth, password reset, and offline grants now live in
`crate::auth` (`src/auth/`, one level up), not in a `modules/auth/` here --
see `src/auth/README.md`.

- `businesses/` owns account-scoped businesses.
- `business_units/` owns shops, branches, warehouses, and desks.
- `products/` owns scoped catalogue and inventory records.
- `team/` owns memberships, roles, permissions, invitations, and employee access.
- `transactions/` owns transaction writes, reads, drafts, and invoices.
- `sync/` owns device-bound offline push/pull and conflict handling.

Roles, permissions, users, accounts, and memberships are database concepts
implemented inside the active auth/team repositories. They do not have empty
parallel Rust modules.
