//! Keycloak authentication and authorization boundary.
//!
//! This module is the migration target for replacing Mbam's local password/JWT
//! authentication with Keycloak-issued identity tokens and role claims. It is
//! intentionally separate from `modules::auth` so route handlers can be moved to
//! Keycloak one boundary at a time without mixing local-token and Keycloak-token
//! rules.

pub mod keycloak;
