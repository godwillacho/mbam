# Development Dashboard Test Accounts

These accounts are recreated whenever the API starts with `APP_ENV=development`.
They use real API users, memberships, roles, permissions, business scopes, and
unit scopes. They are not frontend mock profiles.

## Test Structure

- Business: `Mbam Dashboard Test Business`
- Unit 1: `Dashboard Test Shop One`
- Unit 2: `Dashboard Test Shop Two`

## Credentials

| Baseline | Scope | Email | Password | Expected dashboard |
| --- | --- | --- | --- | --- |
| Master owner | Entire account | `master.test@mbam.local` | `MasterTest123` | `/dashboard/master` |
| Business admin | Business and both units | `admin.test@mbam.local` | `AdminTest123` | `/dashboard/business` |
| Shop manager | Unit 1 | `manager.test@mbam.local` | `ManagerTest123` | `/dashboard/shop` |
| Cashier | Unit 1 | `cashier.test@mbam.local` | `CashierTest123` | `/dashboard/personal` |
| Shop manager | Unit 2 | `manager.two.test@mbam.local` | `ManagerTest123` | `/dashboard/shop` |
| Cashier | Unit 2 | `cashier.two.test@mbam.local` | `CashierTest123` | `/dashboard/personal` |

Cashiers have the personal baseline plus record transaction, drafts,
transactions, and product create/update/view for their assigned shop only.
A business administrator is business-scoped. Unit-level administration uses the
shop-manager baseline.

## Run Locally

Docker Compose manages PostgreSQL only. Start it from the repository root:

```bash
docker compose -f docker-compose.private.yml up -d db
```

Run the API in another terminal:

```bash
cd mbam-api
APP_ENV=development \
DATABASE_URL=postgres://mbam:mbam_private_password_change_me@localhost:5432/mbam \
JWT_ACCESS_SECRET=local_development_access_secret \
cargo run
```

Run the web server in another terminal:

```bash
cd mbam-web
npm install
npm run dev
```

The development seed resets passwords, memberships, role permissions, scopes,
and refresh tokens whenever the API starts.

For a completely clean disposable database:

```bash
docker compose -f docker-compose.private.yml down -v
docker compose -f docker-compose.private.yml up -d db
```

`down -v` deletes the local PostgreSQL volume.

## Validation Scenarios

1. Sign in separately with each account in a fresh private browser window.
2. Confirm authentication validates the API dashboard profile before navigation.
3. Confirm cashier lands on `/dashboard/personal` without waiting for products or transactions to finish loading.
4. Confirm cashier can record a transaction and add/edit products only in the assigned shop.
5. Confirm Unit 1 accounts cannot read or modify Unit 2 products or transactions.
6. Confirm Unit 2 accounts cannot read or modify Unit 1 products or transactions.
7. Confirm URL edits cannot open a broader baseline dashboard.
8. Confirm custom permissions add only their explicit menus and metrics.
9. Confirm missing permission data removes access instead of granting broader access.
