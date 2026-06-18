# Repository Workflow

- After completing and verifying any requested code change, commit all intended
  changes on a descriptive `codex/` branch.
- Fetch the latest remote `main` before integration. Reconcile remote changes
  carefully and resolve conflicts without discarding local or user work.
- Merge the verified commit into local `main`, push `main` to the configured
  GitHub remote, and confirm local and remote `main` are identical and clean.
- Never force-push, reset destructively, or leave completed changes uncommitted
  unless the user explicitly asks to keep the work local or incomplete.
- For every code update, create or update `debug.log` and `error.log` in the
  repository root. Record implementation and verification details in
  `debug.log`, and record encountered errors in `error.log`; keep `error.log`
  present even when no errors occur. Never write secrets, credentials, tokens,
  personal data, or other sensitive values to either log.
