use axum::{
    http::{header, HeaderName, HeaderValue, Method, Request},
    Router,
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use crate::{modules, state::AppState};

pub mod health;

/// Builds top-level routes that don't belong to a specific domain module
/// (currently just the health check -- see `health.rs`).
pub fn router() -> Router<AppState> {
    Router::new().merge(health::router())
}

/// Builds the complete application router: shared middleware (CORS,
/// tracing) plus every domain module's routes nested under its
/// `/api/v1/...` prefix.
///
/// This is the single composition root for "what routes exist and where are
/// they mounted" in the whole API. Each domain module still owns its own
/// `routes.rs` next to its `service.rs`/`repository.rs` (see
/// `REPOSITORY_MAP.md`'s "routes -> service -> repository -> database"
/// pattern) -- this function only wires the already-built per-module
/// routers together, it does not contain any route handler logic itself.
pub fn app_router(state: AppState) -> Router {
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
    let auth_router = if state.config.auth_provider == "legacy" {
        modules::auth::routes::router()
    } else {
        Router::new()
    };

    Router::new()
        .merge(router())
        .nest("/api/v1/auth", auth_router)
        .nest("/api/v1/me", modules::authorization::routes::router())
        .nest("/api/v1/businesses", business_router)
        .nest("/api/v1/products", modules::products::routes::router())
        .nest("/api/v1/reports", modules::reports::routes::router())
        .nest("/api/v1/stock", modules::stock::routes::router())
        .nest("/api/v1/team-members", modules::team::routes::team_router())
        .nest(
            "/api/v1/keycloak-sync",
            modules::keycloak_sync::routes::router(),
        )
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
