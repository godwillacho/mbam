//! Authentication database access.
//!
//! This file will contain SQLx queries for user lookup, user creation,
//! refresh token storage, and auth identity management.

use sqlx::PgPool;

/// Confirms the repository can receive a database pool.
///
/// Real query functions will be added when signup and login are implemented.
pub fn repository_ready(_db: &PgPool) -> bool {
    true
}
