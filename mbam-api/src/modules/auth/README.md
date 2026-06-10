# Auth module

This module owns authentication workflows.

## Files

- `mod.rs` exports the auth module files.
- `dto.rs` defines request and response payloads for signup and login.
- `routes.rs` maps HTTP endpoints to auth handlers.
- `service.rs` contains authentication business logic.
- `repository.rs` contains database queries for users, identities, and auth tokens.

The module will eventually implement real signup, login, refresh token rotation, logout, password reset, and SSO callbacks.
