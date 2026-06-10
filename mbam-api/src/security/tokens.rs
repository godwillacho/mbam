use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// JWT claims used by access tokens.
#[derive(Debug, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    pub sub: Uuid,
    pub exp: usize,
    pub iat: usize,
}

/// Creates a signed access token for a user.
pub fn create_access_token(user_id: Uuid, secret: &str, lifetime_minutes: i64) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let claims = AccessTokenClaims {
        sub: user_id,
        iat: now.timestamp() as usize,
        exp: (now + Duration::minutes(lifetime_minutes)).timestamp() as usize,
    };

    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
}

/// Creates a high-entropy opaque refresh token.
///
/// The raw token is returned to the client once. The service stores only a hash
/// in the database so refresh tokens are not recoverable from storage.
pub fn create_refresh_token() -> String {
    Uuid::new_v4().to_string()
}

/// Verifies an access token and returns its claims.
pub fn verify_access_token(token: &str, secret: &str) -> Result<AccessTokenClaims, jsonwebtoken::errors::Error> {
    let token_data = decode::<AccessTokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}
