use std::env;

/// Runtime configuration loaded from environment variables.
///
/// Keeping configuration typed makes startup failures clear and prevents route
/// handlers from reading environment variables directly.
#[derive(Clone, Debug)]
pub struct Config {
    pub app_env: String,
    pub api_host: String,
    pub api_port: u16,
    pub database_url: String,
    pub jwt_access_secret: String,
    pub jwt_refresh_secret: String,
    pub access_token_minutes: i64,
    pub refresh_token_days: i64,
    pub offline_grant_private_key_pem: Option<String>,
    pub offline_grant_days: i64,
    pub web_origin: String,
}

impl Config {
    /// Reads configuration from the current process environment.
    pub fn from_env() -> Result<Self, env::VarError> {
        Ok(Self {
            app_env: read_or_default("APP_ENV", "development"),
            api_host: read_or_default("API_HOST", "127.0.0.1"),
            api_port: read_or_default("API_PORT", "8080").parse().unwrap_or(8080),
            database_url: env::var("DATABASE_URL")?,
            jwt_access_secret: env::var("JWT_ACCESS_SECRET")?,
            jwt_refresh_secret: env::var("JWT_REFRESH_SECRET")?,
            access_token_minutes: read_or_default("ACCESS_TOKEN_MINUTES", "15")
                .parse()
                .unwrap_or(15),
            refresh_token_days: read_or_default("REFRESH_TOKEN_DAYS", "30")
                .parse()
                .unwrap_or(30),
            offline_grant_private_key_pem: env::var("OFFLINE_GRANT_PRIVATE_KEY_PEM")
                .ok()
                .map(|value| value.replace("\\n", "\n")),
            offline_grant_days: read_or_default("OFFLINE_GRANT_DAYS", "7")
                .parse()
                .unwrap_or(7),
            web_origin: read_or_default("WEB_ORIGIN", "http://localhost:5173"),
        })
    }
}

/// Reads an environment variable or returns a default value.
fn read_or_default(key: &str, default_value: &str) -> String {
    env::var(key).unwrap_or_else(|_| default_value.to_string())
}
