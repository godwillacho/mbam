mod config;
mod db;
mod error;
mod modules;
mod routes;
mod security;
mod state;

use axum::Router;
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{config::Config, db::pool::connect_database, state::AppState};

/// Starts the Mbam API server.
///
/// The entrypoint keeps startup concerns in one place:
/// configuration loading, logging, database connection, migrations, route mounting,
/// and HTTP serving.
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    init_tracing();

    let config = Config::from_env()?;
    let pool = connect_database(&config.database_url).await?;

    // Run migrations on startup for the early development stage.
    // Later, production deployments should run migrations as a separate step.
    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = AppState::new(config.clone(), pool);
    let app = build_router(state);

    let addr: SocketAddr = format!("{}:{}", config.api_host, config.api_port).parse()?;
    tracing::info!(%addr, "starting Mbam API");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Builds the application router and attaches shared middleware.
fn build_router(state: AppState) -> Router {
    Router::new()
        .merge(routes::router())
        .nest("/api/v1/auth", modules::auth::routes::router())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Initializes structured logs for local and production visibility.
fn init_tracing() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "mbam_api=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();
}
