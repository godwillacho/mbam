# Private testing deployment

This guide explains how to host Mbam privately for early family testing.

The first testing goal is simple: run the current frontend privately, then add the Rust API and PostgreSQL behind the same private access layer as features become real.

## Recommended private access options

### Option 1: Tailscale

Use this if you want the app to be reachable only by devices you approve.

Good for:

- Private family testing
- No public domain required
- No open router ports
- Easy access control

Basic flow:

1. Install Docker on the host machine.
2. Install Tailscale on the host machine.
3. Invite your dad to your Tailscale network.
4. Run Mbam with Docker Compose.
5. Expose `localhost:8080` through Tailscale Serve.

### Option 2: Cloudflare Tunnel with Access

Use this if you want a private URL protected by email login.

Good for:

- Private hosted URL
- No open router ports
- Email-based access control
- Easy upgrade path to production

Basic flow:

1. Put the app behind a Cloudflare Tunnel.
2. Use Cloudflare Access to allow only approved emails.
3. Point the tunnel to `http://localhost:8080`.

### Option 3: Local LAN only

Use this if your dad is physically on the same Wi-Fi network.

Good for:

- Very early testing
- No external access
- No public exposure

Update `docker-compose.private.yml` from `127.0.0.1:8080:80` to `8080:80`, then access the host machine's LAN IP.

## Run the private stack

From the repository root:

```bash
docker compose -f docker-compose.private.yml up --build
```

Open locally:

```text
http://localhost:8080
```

## Services

- `web` serves the React app through Nginx.
- `api` runs the Rust Axum backend.
- `db` runs PostgreSQL 16.

## Security notes before real testing

Change these values in `docker-compose.private.yml` before giving access to anyone:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

For the first private test, avoid storing real customer-sensitive data until real authentication and transaction persistence are fully implemented.

## What works now

- Frontend design pages
- Auth design flow
- Dashboard design
- Transaction record design
- Team access design
- Business and shop structure design
- Reports design
- Rust API health endpoint
- PostgreSQL container

## What still needs implementation

- Real signup and login in Rust
- Password hashing connected to user records
- Token issuance and refresh token storage
- Transaction persistence
- IndexedDB offline queue
- Sync push and pull endpoints
- Role-based backend permission checks
