use std::env;
use thiserror::Error;

/// Runtime configuration loaded from environment variables.
///
/// Keeping configuration typed makes startup failures clear and prevents route
/// handlers from reading environment variables directly.
#[derive(Clone)]
pub struct Config {
    pub app_env: String,
    pub api_host: String,
    pub api_port: u16,
    pub database_url: String,
    pub auth_provider: String,
    pub keycloak_issuer_url: Option<String>,
    pub keycloak_client_id: Option<String>,
    pub keycloak_client_secret: Option<String>,
    pub keycloak_audience: Option<String>,
    pub keycloak_role_client_id: Option<String>,
    pub keycloak_allow_email_linking: bool,
    pub jwt_access_secret: String,
    pub access_token_minutes: i64,
    pub refresh_token_days: i64,
    pub offline_grant_private_key_pem: Option<String>,
    pub offline_grant_days: i64,
    pub web_origin: String,
    pub google_oauth_client_id: Option<String>,
    pub google_oauth_client_secret: Option<String>,
    pub google_oauth_redirect_uri: Option<String>,
    pub microsoft_oauth_client_id: Option<String>,
    pub microsoft_oauth_client_secret: Option<String>,
    pub microsoft_oauth_redirect_uri: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    pub smtp_from_email: Option<String>,
    pub smtp_from_name: String,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable {0}")]
    Missing(&'static str),
    #[error("invalid value for {0}")]
    Invalid(&'static str),
    #[error("JWT_ACCESS_SECRET must contain at least 32 characters outside development")]
    WeakAccessSecret,
}

impl Config {
    /// Reads configuration from the current process environment.
    pub fn from_env() -> Result<Self, ConfigError> {
        let app_env = read_or_default("APP_ENV", "development");
        let jwt_access_secret = required_var("JWT_ACCESS_SECRET")?;
        if app_env != "development" && jwt_access_secret.len() < 32 {
            return Err(ConfigError::WeakAccessSecret);
        }

        Ok(Self {
            app_env,
            api_host: read_or_default("API_HOST", "127.0.0.1"),
            api_port: parse_positive("API_PORT", "8080")?,
            database_url: required_var("DATABASE_URL")?,
            auth_provider: read_or_default("AUTH_PROVIDER", "legacy").to_lowercase(),
            keycloak_issuer_url: optional_var("KEYCLOAK_ISSUER_URL"),
            keycloak_client_id: optional_var("KEYCLOAK_CLIENT_ID"),
            keycloak_client_secret: optional_var("KEYCLOAK_CLIENT_SECRET"),
            keycloak_audience: optional_var("KEYCLOAK_AUDIENCE"),
            keycloak_role_client_id: optional_var("KEYCLOAK_ROLE_CLIENT_ID"),
            keycloak_allow_email_linking: read_bool("KEYCLOAK_ALLOW_EMAIL_LINKING", false),
            jwt_access_secret,
            access_token_minutes: parse_positive("ACCESS_TOKEN_MINUTES", "15")?,
            refresh_token_days: parse_positive("REFRESH_TOKEN_DAYS", "30")?,
            offline_grant_private_key_pem: env::var("OFFLINE_GRANT_PRIVATE_KEY_PEM")
                .ok()
                .map(|value| value.replace("\\n", "\n")),
            offline_grant_days: parse_positive("OFFLINE_GRANT_DAYS", "7")?,
            web_origin: read_or_default("WEB_ORIGIN", "http://localhost:5173"),
            google_oauth_client_id: optional_var("GOOGLE_OAUTH_CLIENT_ID"),
            google_oauth_client_secret: optional_var("GOOGLE_OAUTH_CLIENT_SECRET"),
            google_oauth_redirect_uri: optional_var("GOOGLE_OAUTH_REDIRECT_URI"),
            microsoft_oauth_client_id: optional_var("MICROSOFT_OAUTH_CLIENT_ID"),
            microsoft_oauth_client_secret: optional_var("MICROSOFT_OAUTH_CLIENT_SECRET"),
            microsoft_oauth_redirect_uri: optional_var("MICROSOFT_OAUTH_REDIRECT_URI"),
            smtp_host: optional_var("SMTP_HOST"),
            smtp_port: parse_positive("SMTP_PORT", "587")?,
            smtp_username: optional_var("SMTP_USERNAME"),
            smtp_password: optional_var("SMTP_PASSWORD"),
            smtp_from_email: optional_var("SMTP_FROM_EMAIL"),
            smtp_from_name: read_or_default("SMTP_FROM_NAME", "Mbam"),
        })
    }
}

/// Reads an environment variable or returns a default value.
fn read_or_default(key: &str, default_value: &str) -> String {
    env::var(key).unwrap_or_else(|_| default_value.to_string())
}

fn required_var(key: &'static str) -> Result<String, ConfigError> {
    optional_var(key).ok_or(ConfigError::Missing(key))
}

fn parse_positive<T>(key: &'static str, default_value: &str) -> Result<T, ConfigError>
where
    T: std::str::FromStr + PartialOrd + Default,
{
    let value = read_or_default(key, default_value)
        .parse::<T>()
        .map_err(|_| ConfigError::Invalid(key))?;
    if value <= T::default() {
        return Err(ConfigError::Invalid(key));
    }
    Ok(value)
}

/// Reads a boolean environment variable with a deterministic fallback.
fn read_bool(key: &str, default_value: bool) -> bool {
    env::var(key)
        .ok()
        .and_then(|value| value.parse::<bool>().ok())
        .unwrap_or(default_value)
}

/// Reads a trimmed optional environment variable and rejects placeholders.
fn optional_var(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "replace_me")
}
