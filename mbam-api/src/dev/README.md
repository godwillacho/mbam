# Dev

Development-only fixtures and demo data, grouped together so a reader doesn't
have to distinguish real application modules from test/demo scaffolding by
filename prefix alone. None of this runs in production; every entry point is
gated behind `config.app_env == "development"` in `main.rs`.

## Files

- `seed.rs` (formerly `dev_seed.rs`) -- deterministic dashboard-test account
  fixture, consumed by `checklist_tests.rs` and documented in
  `DEVELOPMENT_TEST_ACCOUNTS.md`.
- `seed_cleanup.rs` (formerly `dev_seed_cleanup.rs`) -- clears the above
  fixture before reseeding, so repeated local restarts don't accumulate
  stale rows.
- `demo_data.rs` (formerly `dev_demo_data.rs`) -- a separate, isolated demo
  business account with historical backfill and a live-traffic background
  worker, deliberately independent from `seed.rs`'s minimal fixture. Its
  `upsert_role()` re-grants that demo account's role permissions on every
  startup from its own hardcoded lists -- see the 2026-07-08 debug.log
  entries for why this matters when adding a new permission.
