//! Authentication layer boundary.
//!
//! This module is intentionally separate from the existing application auth code.
//! New authentication work should enter through this boundary so Keycloak can
//! become the identity provider while MBAM keeps ownership of business scope,
//! dashboard scope, offline grants, and least-privilege authorization.

pub mod claims;
pub mod keycloak;
pub mod provider;
pub mod roles;
pub mod session;

pub use claims::AuthenticatedPrincipal;
pub use provider::{AuthProvider, AuthProviderError};
pub use roles::{BaselineRole, RoleMapping};
