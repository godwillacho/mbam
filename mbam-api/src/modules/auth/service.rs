//! Authentication business logic.
//!
//! This file will coordinate password hashing, token creation, account setup,
//! and repository calls. Route handlers should stay thin and call service
//! functions instead of containing business logic directly.

/// Normalizes emails before storing or comparing them.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}
