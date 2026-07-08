//! Single entry point for "where does authentication live" in this backend.
//!
//! The real implementations stay exactly where they were (moving them would
//! be much higher-risk than this facade, given how widely `AuthorizationContext`
//! alone is used across every protected route handler) -- this module only
//! re-exports them under one importable path, `crate::auth::...`, so a reader
//! doesn't need to already know the three-way split to find any of it. See
//! `README.md` in this folder for the full breakdown.

/// Keycloak token verification, the `AuthorizationContext` extractor used by
/// every protected route handler, and `AuthenticationLayer` (selects the
/// legacy-JWT vs Keycloak provider at startup). See
/// `crate::authentication`'s own README for the full design.
pub use crate::authentication::*;

/// Password hashing (Argon2) and access/refresh/offline-grant token
/// issuance/verification.
pub mod tokens_and_passwords {
    pub use crate::security::password::*;
    pub use crate::security::tokens::*;
}

/// HTTP handlers/service/repository for signup, login, refresh, logout,
/// OAuth, password reset, and offline grants -- the legacy (non-Keycloak)
/// auth provider path, mounted at `/api/v1/auth` only when
/// `AUTH_PROVIDER=legacy` (see `routes::app_router`).
pub mod handlers {
    pub use crate::modules::auth::*;
}
