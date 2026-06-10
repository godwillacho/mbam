# Domain modules

This folder contains the main business domains of the Mbam backend.

## Folder map

- `auth/` handles signup, login, token refresh, logout, and password reset flows.
- `users/` handles user profiles and identity records.
- `accounts/` handles master business accounts.
- `businesses/` handles businesses owned by a master account.
- `business_units/` handles shops, branches, warehouses, and other business units.
- `roles/` handles named roles such as Master Owner, Business Admin, Shop Manager, and Cashier.
- `permissions/` handles permission codes used by role checks.
- `memberships/` connects users to accounts, businesses, or units through roles.
- `sync/` will handle offline-first push and pull sync operations.

Each module should keep route handlers, services, repositories, models, and DTOs separate so the backend stays loosely coupled.
