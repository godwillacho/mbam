# Permissions module

This module owns permission codes used by role checks.

Permissions describe actions such as `sale.create`, `worker.invite`, `business.manage`, and `report.view`.

## Files

- `mod.rs` exports the permissions module files.
- `model.rs` defines permission models.
- `repository.rs` will contain SQLx queries for permissions.
- `service.rs` will contain permission-checking helpers.
