# Development Test Accounts

These accounts are seeded automatically when the API starts with `APP_ENV=development`.
They are intended for local UI and API role testing only.

| Role | Email | Password | Expected access |
| --- | --- | --- | --- |
| Business Admin | `admin.test@mbam.local` | `AdminTest123` | Multiple granted businesses and units, team/user admin, businesses, products, reports, transactions, record transaction |
| Shop Manager | `manager.test@mbam.local` | `ManagerTest123` | Douala Test Shop scope, products, reports, transactions, record transaction, team access based on role permissions |
| Cashier | `cashier.test@mbam.local` | `CashierTest123` | Yaounde Test Desk scope, products view, own transactions, record transaction |

Suggested route checks:

- `/transactions/new`
- `/transactions`
- `/products`
- `/team`
- `/businesses`
- `/reports`

The cashier account should not see user/team admin, businesses, or reports navigation.
