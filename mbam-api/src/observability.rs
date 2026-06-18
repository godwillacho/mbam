use std::{borrow::Cow, env, error::Error, fs, path::PathBuf};

use sentry::integrations::tracing::EventFilter;
use tracing::Level;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{
    filter::LevelFilter,
    fmt,
    layer::{Layer, SubscriberExt},
    registry::Registry,
    util::SubscriberInitExt,
    EnvFilter,
};

/// Keeps non-blocking file writers and the optional Sentry client alive.
pub struct ObservabilityGuards {
    _debug_log_guard: WorkerGuard,
    _error_log_guard: WorkerGuard,
    _sentry_guard: Option<sentry::ClientInitGuard>,
}

/// Initializes console logging, daily rolling files, and optional Sentry export.
pub fn init() -> Result<ObservabilityGuards, Box<dyn Error>> {
    let log_directory = PathBuf::from(read_or_default("LOG_DIRECTORY", "logs"));
    fs::create_dir_all(&log_directory)?;

    let debug_appender = tracing_appender::rolling::daily(&log_directory, "debug.log");
    let error_appender = tracing_appender::rolling::daily(&log_directory, "error.log");
    let (debug_writer, debug_guard) = tracing_appender::non_blocking(debug_appender);
    let (error_writer, error_guard) = tracing_appender::non_blocking(error_appender);

    let environment = read_or_default("APP_ENV", "development");
    let json_logs = read_bool("LOG_JSON", environment == "production");
    let console_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "mbam_api=debug,tower_http=info".into());

    let console_layer = if json_logs {
        fmt::layer().json().with_writer(std::io::stdout).boxed()
    } else {
        fmt::layer().compact().with_writer(std::io::stdout).boxed()
    }
    .with_filter(console_filter);

    let debug_layer = fmt::layer()
        .json()
        .with_ansi(false)
        .with_writer(debug_writer)
        .with_filter(LevelFilter::DEBUG);
    let error_layer = fmt::layer()
        .json()
        .with_ansi(false)
        .with_writer(error_writer)
        .with_filter(LevelFilter::ERROR);

    let sentry_guard = init_sentry(&environment);
    let sentry_layer = sentry::integrations::tracing::layer()
        .event_filter(|metadata| match *metadata.level() {
            Level::ERROR => EventFilter::Event,
            Level::WARN | Level::INFO => EventFilter::Breadcrumb,
            Level::DEBUG | Level::TRACE => EventFilter::Ignore,
        })
        .span_filter(|metadata| {
            matches!(*metadata.level(), Level::ERROR | Level::WARN | Level::INFO)
        });

    Registry::default()
        .with(console_layer)
        .with(debug_layer)
        .with(error_layer)
        .with(sentry_layer)
        .init();

    Ok(ObservabilityGuards {
        _debug_log_guard: debug_guard,
        _error_log_guard: error_guard,
        _sentry_guard: sentry_guard,
    })
}

fn init_sentry(environment: &str) -> Option<sentry::ClientInitGuard> {
    let dsn = optional_var("SENTRY_DSN")?;
    let release = optional_var("SENTRY_RELEASE").map(Cow::Owned);
    let traces_sample_rate = read_or_default("SENTRY_TRACES_SAMPLE_RATE", "0")
        .parse::<f32>()
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);

    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            environment: Some(Cow::Owned(environment.to_string())),
            release,
            traces_sample_rate,
            send_default_pii: false,
            ..Default::default()
        },
    )))
}

fn read_or_default(key: &str, default_value: &str) -> String {
    env::var(key).unwrap_or_else(|_| default_value.to_string())
}

fn optional_var(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "replace_me")
}

fn read_bool(key: &str, default_value: bool) -> bool {
    optional_var(key)
        .and_then(|value| value.parse::<bool>().ok())
        .unwrap_or(default_value)
}
