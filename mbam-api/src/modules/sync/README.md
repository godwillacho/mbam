# Sync module

This module will support offline-first frontend synchronization.

The frontend will store changes locally in IndexedDB and push them to the API when internet access returns.

## Files

- `mod.rs` exports sync module files.
- `routes.rs` will expose push and pull sync endpoints.
- `service.rs` will contain conflict handling and operation validation.
