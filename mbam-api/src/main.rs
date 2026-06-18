//! Mbam API entrypoint.
//!
//! The backend exposes authenticated business, team, product, transaction, and
//! synchronization APIs over PostgreSQL.

mod authentication;
mod config;
mod db;
mod dev_seed;
mod dev_seed_cleanup;
mod error;
mod modules;
mod observability;
mod routes;
mod security;
mod state;

use crate::{
    authentication::AuthenticationLayer, config::Config, db::pool::connect_database,
    state::AppState,
};
use axum::{
    http::{header, HeaderName, HeaderValue, Method, Request},
    Router,
};
use std::{io, net::SocketAddr};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
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
        match dev_seed_cleanup::cleanup_test_fixture(&pool).await {
            Ok(()) => {
                if let Err(error) = dev_seed::seed_test_accounts(&pool).await {
                    tracing::warn!(?error, "development test account seed failed");
                }
            }
            Err(error) => tracing::warn!(
                ?error,
                "development test account cleanup failed; seed skipped to avoid stale access"
            ),
        }
    }

    let state = AppState::new(config.clone(), pool, authentication);
    let app = build_router(state);

    let addr: SocketAddr = format!("{}:{}", config.api_host, config.api_port).parse()?;
    tracing::info!(%addr, auth_provider = %config.auth_provider, "starting Mbam API");

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
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            HeaderName::from_static("baggage"),
            header::CONTENT_TYPE,
            HeaderName::from_static("sentry-trace"),
            HeaderName::from_static("x-mbam-device-id"),
            HeaderName::from_static("x-mbam-device-fingerprint"),
            HeaderName::from_static("x-mbam-device-label"),
        ]);
    let business_router =
        modules::businesses::routes::router().merge(modules::business_units::routes::router());

    Router::new()
        .merge(routes::router())
        .nest("/api/v1/auth", modules::auth::routes::router())
        .nest("/api/v1/me", modules::authorization::routes::router())
        .nest("/api/v1/businesses", business_router)
        .nest("/api/v1/products", modules::products::routes::router())
        .nest("/api/v1/reports", modules::reports::routes::router())
        .nest("/api/v1/team-members", modules::team::routes::team_router())
        .nest(
            "/api/v1/invites",
            modules::team::routes::invitation_router(),
        )
        .nest("/api/v1/sync", modules::sync::routes::router())
        .nest(
            "/api/v1/transactions",
            modules::transactions::routes::router(),
        )
        .layer(cors)
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &Request<_>| {
                tracing::info_span!(
                    "http.request",
                    http.method = %request.method(),
                    http.path = request.uri().path(),
                )
            }),
        )
        .with_state(state)
}
