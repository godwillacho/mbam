# Sync module

This module implements offline-first frontend synchronization.

The frontend will store changes locally in IndexedDB and push them to the API when internet access returns.

## Files

- `mod.rs` exports sync module files.
- `routes.rs` exposes authenticated push and pull endpoints.
- `service.rs` validates device binding, permissions, scopes, versions, and
  conflict outcomes.
