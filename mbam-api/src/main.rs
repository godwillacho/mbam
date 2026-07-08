//! Mbam API entrypoint.
//!
//! The backend exposes authenticated business, team, product, transaction, and
//! synchronization APIs over PostgreSQL.

mod auth;
mod config;
mod db;
mod dev;
mod error;
mod modules;
mod observability;
mod routes;
mod state;
#[cfg(test)]
mod checklist_tests;

use crate::{
    auth::AuthenticationLayer, config::Config, db::pool::connect_database, state::AppState,
};
use std::{io, net::SocketAddr};
/// Starts the Mbam API server.
///
/// The entrypoint validates authentication configuration before accepting any
/// requests, preventing a partially configured Keycloak mode from starting.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let _observability_guards = observability::init()?;

    let config = Config::from_env()?;
    let authentication = AuthenticationLayer::from_config(&config).map_err(io::Error::other)?;
    let pool = connect_database(&config.database_url).await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    if config.app_env == "development" {
        match dev::seed_cleanup::cleanup_test_fixture(&pool).await {
            Ok(()) => {
                if let Err(error) = dev::seed::seed_test_accounts(&pool).await {
                    tracing::warn!(?error, "development test account seed failed");
                }
            }
            Err(error) => tracing::warn!(
                ?error,
                "development test account cleanup failed; seed skipped to avoid stale access"
            ),
        }

        if let Err(error) = dev::demo_data::seed_demo_business(&pool).await {
            tracing::warn!(?error, "development demo business seed failed");
        }
    }

    let state = AppState::new(config.clone(), pool, authentication);
    modules::keycloak_sync::service::spawn_worker(state.db.clone(), config.clone());
    if config.app_env == "development" {
        dev::demo_data::spawn_demo_traffic_worker(state.db.clone());
    }
    let app = routes::app_router(state);

    let addr: SocketAddr = format!("{}:{}", config.api_host, config.api_port).parse()?;
    tracing::info!(%addr, auth_provider = %config.auth_provider, "starting Mbam API");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
