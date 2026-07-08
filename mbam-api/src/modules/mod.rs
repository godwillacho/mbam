/// Active API domain modules.
///
/// The legacy (non-Keycloak) auth provider now lives under `crate::auth::legacy`
/// alongside the rest of authentication -- see `src/auth/README.md`.
pub mod audit;
pub mod authorization;
pub mod business_units;
pub mod businesses;
pub mod keycloak_sync;
pub mod products;
pub mod reports;
pub mod stock;
pub mod sync;
pub mod team;
pub mod transactions;
