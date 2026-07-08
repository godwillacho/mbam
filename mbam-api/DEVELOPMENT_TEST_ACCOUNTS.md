# Development Dashboard Test Accounts

These accounts are recreated whenever the API starts with `APP_ENV=development`.
They use real API users, memberships, roles, permissions, business scopes, and
unit scopes. They are not frontend mock profiles.

A separate, richer demo account ("Mbam Demo Retail Group," 3 shops, live
transaction traffic) is also seeded — see `debug.log`/
`docs/ENGINEERING_DEBUG_LOG.md`'s 2026-07-03 "Isolated Demo Business Account"
entry for those credentials. Everything on this page applies equally to both
sets of accounts.

## Important: these passwords do not work in the browser by themselves

The password column below is the **Postgres** password for each seeded user
(`src/dev/seed.rs` writes it as an Argon2 hash). It only matters if the API is
running with `AUTH_PROVIDER=legacy`.

With the supported runtime default, `AUTH_PROVIDER=keycloak`, **Keycloak owns
credentials, not Postgres** — the web app's sign-in button redirects straight
to Keycloak's hosted login, and Keycloak has no idea these emails exist until
you create matching Keycloak users yourself (the Keycloak realm import only
creates a machine service account, and self-registration is disabled).
Resetting the database does not fix this, because the missing piece is in
Keycloak, not Postgres.

### One-time setup: link a Keycloak user to a seeded account

Repeat for each seeded email you want to sign in as through the browser.

1. Open `http://localhost:8180/admin` and log in with
   `KEYCLOAK_ADMIN_USERNAME`/`KEYCLOAK_ADMIN_PASSWORD` (defaults `admin` /
   `change_this_local_admin_password` unless overridden in your
   `docker-compose.private.env`).
2. Switch to the **mbam** realm (top-left realm selector).
3. **Users → Add user.** Email = the exact seeded email (e.g.
   `master.test@mbam.local`). Toggle **Email verified** on. Save.
4. **Credentials tab → Set password.** Choose any password — this is the one
   you'll actually type when signing in, not the value in the table below.
   Uncheck "Temporary" so Keycloak doesn't force a reset on first login.
5. **Role mapping tab → Assign role.** Assign the realm role matching that
   account's baseline: `master_owner`, `business_admin`, `shop_manager`, or
   `cashier` (see the table below). This step is required — without it,
   sign-in still fails with a Keycloak/Mbam role mismatch even after the
   email is linked.
6. In `mbam-api/.env`, set `KEYCLOAK_ALLOW_EMAIL_LINKING=true`, then restart
   `cargo run`. On the first successful Keycloak login for that email, the
   API auto-links the Keycloak subject to the existing Postgres user (writes
   an `auth_identities` row); the link persists after that, so you can set
   `KEYCLOAK_ALLOW_EMAIL_LINKING` back to `false` once every account you
   need is linked.

See `mbam-api/src/auth/README.md` for the full request flow and
why linking is gated behind a verified email and an exact role match.

## Test Structure

- Business: `Mbam Dashboard Test Business`
- Unit 1: `Dashboard Test Shop One`
- Unit 2: `Dashboard Test Shop Two`

## Credentials

| Baseline | Scope | Email | Keycloak realm role to assign | Postgres-only password | Expected dashboard |
| --- | --- | --- | --- | --- | --- |
| Master owner | Entire account | `master.test@mbam.local` | `master_owner` | `MasterTest123` | `/dashboard/master` |
| Business admin | Business and both units | `admin.test@mbam.local` | `business_admin` | `AdminTest123` | `/dashboard/business` |
| Shop manager | Unit 1 | `manager.test@mbam.local` | `shop_manager` | `ManagerTest123` | `/dashboard/shop` |
| Cashier | Unit 1 | `cashier.test@mbam.local` | `cashier` | `CashierTest123` | `/dashboard/personal` |
| Shop manager | Unit 2 | `manager.two.test@mbam.local` | `shop_manager` | `ManagerTest123` | `/dashboard/shop` |
| Cashier | Unit 2 | `cashier.two.test@mbam.local` | `cashier` | `CashierTest123` | `/dashboard/personal` |

Cashiers have the personal baseline plus record transaction, drafts,
transactions, and product create/update/view for their assigned shop only.
A business administrator is business-scoped. Unit-level administration uses the
shop-manager baseline.

## Run Locally

Docker Compose manages PostgreSQL and Keycloak together. Start it from the
repository root:

```bash
cp docker-compose.private.env.example .env
docker compose -f docker-compose.private.yml up -d
```

Run the API in another terminal:

```bash
cd mbam-api
cp .env.example .env   # only if you don't already have one; edit KEYCLOAK_* values to match
cargo run
```

Run the web server in another terminal:

```bash
cd mbam-web
npm install
npm run dev
```

The development seed resets memberships, role permissions, scopes, and
refresh tokens whenever the API starts, but it does not touch Keycloak — the
Keycloak users you create per the linking steps above persist across
restarts and database resets.

For a completely clean disposable database:

```bash
docker compose -f docker-compose.private.yml down -v
docker compose -f docker-compose.private.yml up -d
```

`down -v` deletes the local PostgreSQL volume (and the Keycloak data volume,
which means you'll need to redo the Keycloak user-linking steps above too).

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
