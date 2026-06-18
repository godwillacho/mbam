# Repository Workflow

- After completing and verifying any requested code change, commit all intended
  changes on a descriptive `codex/` branch.
- Fetch the latest remote `main` before integration. Reconcile remote changes
  carefully and resolve conflicts without discarding local or user work.
- Merge the verified commit into local `main`, push `main` to the configured
  GitHub remote, and confirm local and remote `main` are identical and clean.
- Never force-push, reset destructively, or leave completed changes uncommitted
  unless the user explicitly asks to keep the work local or incomplete.

## Required Debug And Error Log

- For every code update, create or update `debug.log` and `error.log` in the
  repository root. Record implementation and verification details in
  `debug.log`, and record encountered errors in `error.log`. Keep both files
  present even when no errors occur.
- Every code update must include a corresponding entry in
  `docs/ENGINEERING_DEBUG_LOG.md` in the same change set.
- A code change is incomplete until its log entry has been added.
- Each entry must record the UTC date, related commit or change identifier,
  requested behavior, root cause or engineering reason, files changed,
  debugging and verification performed, errors encountered, checks not run,
  remaining risks, and follow-up checks.
- Documentation-only changes do not require a log entry unless they alter
  engineering, security, build, deployment, or operational behavior.
- Never record passwords, tokens, cookies, private keys, authorization headers,
  device fingerprints, customer data, or personally identifiable information.
  Redact sensitive values from command output and runtime errors.
