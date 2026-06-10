# Memberships module

This module connects users to business accounts, businesses, or business units through roles.

A membership can be scoped at master account level, business level, or shop/unit level.

## Files

- `mod.rs` exports the memberships module files.
- `model.rs` defines the membership model.
- `repository.rs` will contain SQLx queries for memberships.
- `service.rs` will contain membership invitation and scope rules.
