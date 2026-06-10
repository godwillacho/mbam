# Businesses module

This module owns businesses inside a master business account.

A master account can control multiple businesses centrally. Each business can contain multiple shops or units.

## Files

- `mod.rs` exports the businesses module files.
- `model.rs` defines the business model.
- `repository.rs` will contain SQLx queries for businesses.
- `service.rs` will contain business creation, update, and access rules.
