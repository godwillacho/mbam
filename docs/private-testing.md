# Private testing deployment

This guide explains how to host Mbam privately for early family testing.

`docker-compose.private.yml` currently starts only PostgreSQL and Keycloak;
the Rust API and Vite web server are run directly on the host (see
`mbam-api/README_MAC_DEBUG.md` and `mbam-api/DEVELOPMENT_TEST_ACCOUNTS.md`
for the exact commands and default local credentials). Container images for
the API and web app exist (`mbam-api/Dockerfile`, `mbam-web/Dockerfile`,
`mbam-web/nginx.conf`) for a future fully-containerized deployment, but no
compose file wires them together with `db`/`keycloak` yet — that is tracked
as a follow-up, not covered by this guide.

## Recommended private access options

### Option 1: Tailscale

Use this if you want the app to be reachable only by devices you approve.

Good for:

- Private family testing
- No public domain required
- No open router ports
- Easy access control

Basic flow:

1. Install Tailscale on the host machine.
2. Invite your dad to your Tailscale network.
3. Run the private stack (below) plus the API and web server on the host.
4. Expose the web server's port (default `5173` for `npm run dev`, or
   whatever port the production build is served on) through Tailscale Serve.

### Option 2: Cloudflare Tunnel with Access

Use this if you want a private URL protected by email login.

Good for:

- Private hosted URL
- No open router ports
- Email-based access control
- Easy upgrade path to production

Basic flow:

1. Put the web server behind a Cloudflare Tunnel.
2. Use Cloudflare Access to allow only approved emails.
3. Point the tunnel to the host/port the web server is running on.

### Option 3: Local LAN only

Use this if your dad is physically on the same Wi-Fi network.

Good for:

- Very early testing
- No external access
- No public exposure

Change `docker-compose.private.yml`'s `POSTGRES_HOST_PORT`/`KEYCLOAK_HOST_PORT`
bindings from `127.0.0.1:...` to `0.0.0.0:...` only if another device on the
LAN needs to reach Postgres or Keycloak directly (rare) — for most private
LAN testing, just point the other device's browser at the host machine's LAN
IP and the web server's port; the database and identity provider stay
loopback-only.

## Run the private stack

From the repository root:

```bash
docker compose -f docker-compose.private.yml up -d
```

This starts PostgreSQL (`127.0.0.1:5432` by default) and Keycloak
(`127.0.0.1:8180` by default, realm auto-imported from
`keycloak/mbam-realm.json`). Then, in separate terminals, run the API and web
server on the host per `mbam-api/README_MAC_DEBUG.md` and the web app's
`README.md`.

## Security notes before real testing

Change these values in a local `docker-compose.private.env` (or exported
environment variables — see `docker-compose.private.env.example`) before
giving access to anyone:

- `POSTGRES_PASSWORD`
- `KEYCLOAK_ADMIN_PASSWORD`
- `JWT_ACCESS_SECRET` (set when running `mbam-api`, not in the compose file)

For any private test involving people outside the immediate household, avoid
storing real customer-sensitive data until the offline-sync and encryption
layers have had a security review pass (see `docs/security-review-2026-06-11.md`
and `docs/security-rules.md`).

## What works now

Authentication (Keycloak-based and legacy email/password), role-scoped
dashboards, business/shop/product/team management, transaction recording and
invoices, CSV import for products and employees, scoped reporting with
Recharts visualizations, and API-authoritative offline sync are all
implemented — see `REPOSITORY_MAP.md` for the current module map and
`docs/MBAM_REFACTOR_CHECKLIST.md` for what has shipped.

## What still needs implementation

See `docs/future-receipt-import.md`, `docs/future-receipts-and-invoices.md`,
and `docs/future-stock-management.md` for planned features not yet built, and
the "Remaining risks and follow-up checks" sections of recent entries in
`docs/ENGINEERING_DEBUG_LOG.md` for known gaps in already-shipped features.
