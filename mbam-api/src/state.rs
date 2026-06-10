use sqlx::PgPool;

use crate::config::Config;

/// Shared application state injected into route handlers by Axum.
///
/// State currently contains configuration and the PostgreSQL pool. As the API
/// grows, service clients that are safe to share can be added here.
#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: PgPool,
}

impl AppState {
    /// Creates a new application state object.
    pub fn new(config: Config, db: PgPool) -> Self {
        Self { config, db }
    }
}
