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
| Master owner | Entire account | `master.test@mbam.local` | `MasterTest123` | `/dashboard?view=master` |
| Business admin | Business and both units | `admin.test@mbam.local` | `AdminTest123` | `/dashboard?view=business` |
| Shop manager | Unit 1 | `manager.test@mbam.local` | `ManagerTest123` | `/dashboard?view=shop` |
| Cashier | Unit 1 | `cashier.test@mbam.local` | `CashierTest123` | `/dashboard?view=personal` |
| Shop manager | Unit 2 | `manager.two.test@mbam.local` | `ManagerTest123` | `/dashboard?view=shop` |
| Cashier | Unit 2 | `cashier.two.test@mbam.local` | `CashierTest123` | `/dashboard?view=personal` |

A business administrator is intentionally business-scoped. Unit-level
administration uses the shop-manager baseline. The API rejects a business admin
assigned directly to one unit.

## Recreate Locally

Pull `main` and restart the API. The seed resets passwords, memberships, scopes,
and refresh tokens for these users every time the development API starts.

For a completely clean disposable database:

```bash
docker compose -f docker-compose.private.yml down -v
docker compose -f docker-compose.private.yml up --build
```

`down -v` deletes the local PostgreSQL volume. Do not run it against data you
need to retain.

## Validation Scenarios

1. Sign in separately with each account in a fresh private browser window.
2. Confirm access bootstrap completes once and selects the authenticated user's
   profile rather than the first profile returned by the API.
3. Confirm each account lands on the expected baseline dashboard.
4. Confirm Unit 1 accounts cannot read Unit 2 transactions or products.
5. Confirm Unit 2 accounts cannot read Unit 1 transactions or products.
6. Confirm cashiers cannot open master or business dashboards through URL edits.
7. Confirm shop managers cannot open business or master dashboards.
8. Confirm the business admin can access both units but not another account.
9. Confirm missing custom permissions removes menus and metrics instead of
   granting broader access.
