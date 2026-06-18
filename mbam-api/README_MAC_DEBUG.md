# Running Mbam API on macOS for Debugging

This guide is for local Rust API development on macOS.

## 1. Install local dependencies

```bash
brew install rustup-init postgresql@16
rustup-init
```

Restart the terminal, then confirm Rust is available:

```bash
rustc --version
cargo --version
```

Start PostgreSQL:

```bash
brew services start postgresql@16
```

Create a local database:

```bash
createdb mbam_dev
```

## 2. Create local environment file

From the repository root:

```bash
cd mbam-api
cp .env.example .env
```

Update `.env` if your local PostgreSQL username or port is different.

## 3. Run checks

```bash
cargo fmt
cargo check
```

## 4. Run the API

```bash
cargo run
```

Default local API URL:

```text
http://127.0.0.1:8080
```

Health check:

```bash
curl http://127.0.0.1:8080/health
```

Expected response:

```json
{"status":"ok","service":"mbam-api"}
```

## 5. Run with debug logs

```bash
RUST_LOG=mbam_api=debug,tower_http=debug cargo run
```

## 6. Terminal switch testing rule

Every API feature must include a terminal switch/manual runner that can exercise the new logic from the command line.

For auth, run:

```bash
cargo run --bin auth_switch
```

This switch runner gives numbered options for local auth checks and prints/runs the relevant local requests.

## 7. Current startup dependency

The API currently requires:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`

If any of these are missing, startup should fail early. That is intentional for debugging because it prevents the API from running with unsafe defaults.
