# Roles module

This module owns named roles such as Master Owner, Business Admin, Shop Manager, Cashier, and Viewer.

Roles are assigned to memberships and receive permissions through `role_permissions`.

## Files

- `mod.rs` exports the roles module files.
- `model.rs` defines the role model.
- `repository.rs` will contain SQLx queries for roles.
- `service.rs` will contain role creation and validation rules.
