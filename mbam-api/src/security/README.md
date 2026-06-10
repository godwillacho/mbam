# Security

This folder contains backend security helpers.

## Files

- `mod.rs` exports security modules.
- `password.rs` hashes and verifies passwords using Argon2id.
- `tokens.rs` creates and verifies JWT access tokens.

Security logic should stay here or in dedicated middleware so domain modules do not duplicate sensitive logic.
