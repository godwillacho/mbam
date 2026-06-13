#![allow(dead_code)]
//! Mbam API entrypoint.
//!
//! The backend is currently in scaffold mode. Several modules define models,
//! repositories, and helpers before the real route handlers call them. The
//! temporary `dead_code` allowance keeps `cargo check` readable during this
//! setup phase and should be removed once the auth and business flows are wired.

mod config;
mod db;
mod error;
mod modules;
mod routes;
mod security;
mod state;

use axum::{
    http::{header, HeaderValue, Method},
    Router,
};
use std::net::SocketAddr;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
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
    let web_origin = HeaderValue::from_str(&state.config.web_origin)
        .expect("WEB_ORIGIN must be a valid HTTP origin");
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::exact(web_origin))
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::ACCEPT, header::AUTHORIZATION, header::CONTENT_TYPE]);

    Router::new()
        .merge(routes::router())
        .nest("/api/v1/auth", modules::auth::routes::router())
        .nest("/api/v1/businesses", modules::businesses::routes::router())
        .nest("/api/v1/team-members", modules::team::routes::team_router())
        .nest(
            "/api/v1/invites",
            modules::team::routes::invitation_router(),
        )
        .nest("/api/v1/sync", modules::sync::routes::router())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Initializes structured logs for local and production visibility.
fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mbam_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}
