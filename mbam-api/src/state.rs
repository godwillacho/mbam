use sqlx::PgPool;

use crate::{authentication::AuthenticationLayer, config::Config};

/// Shared application state injected into route handlers by Axum.
///
/// Authentication is constructed once at startup so every protected route uses
/// the same provider configuration and validation policy.
#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: PgPool,
    pub authentication: AuthenticationLayer,
}

impl AppState {
    /// Creates application state from validated configuration and shared services.
    pub fn new(config: Config, db: PgPool, authentication: AuthenticationLayer) -> Self {
        Self {
            config,
            db,
            authentication,
        }
    }
}
