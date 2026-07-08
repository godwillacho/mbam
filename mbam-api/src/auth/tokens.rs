use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// JWT claims used by access tokens.
#[derive(Debug, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    pub sub: Uuid,
    pub exp: usize,
    pub iat: usize,
}

/// Claims in a device-specific grant used only to unlock cached offline data.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineGrantClaims {
    pub grant_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub email: String,
    pub device_id: Uuid,
    pub baseline_role: String,
    pub business_ids: Vec<Uuid>,
    pub business_unit_ids: Vec<Uuid>,
    pub permissions: Vec<String>,
    pub authorization_version: i64,
    pub issued_at: String,
    pub offline_until: String,
    pub exp: usize,
    pub iat: usize,
}

/// User and authorization data embedded in an offline grant.
pub struct OfflineGrantSubject {
    pub user_id: Uuid,
    pub display_name: String,
    pub email: String,
    pub device_id: Uuid,
    pub baseline_role: String,
    pub business_ids: Vec<Uuid>,
    pub business_unit_ids: Vec<Uuid>,
    pub permissions: Vec<String>,
    pub authorization_version: i64,
}

/// Creates a signed access token for a user.
pub fn create_access_token(
    user_id: Uuid,
    secret: &str,
    lifetime_minutes: i64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let claims = AccessTokenClaims {
        sub: user_id,
        iat: now.timestamp() as usize,
        exp: (now + Duration::minutes(lifetime_minutes)).timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

/// Creates a high-entropy opaque refresh token.
///
/// The raw token is returned to the client once. The service stores only a hash
/// in the database so refresh tokens are not recoverable from storage.
pub fn create_refresh_token() -> String {
    Uuid::new_v4().to_string()
}

/// Creates an ES256 grant that the web app can verify using the public key.
///
/// jsonwebtoken 10 dropped its built-in PEM convenience constructors (only
/// `*_der` remains), so the caller-supplied PEM text is parsed into raw DER
/// bytes here via the `pem` crate before being handed to
/// `EncodingKey::from_ec_der`. Both current call sites discard the specific
/// error value (`.map_err(|_| ApiError::Internal)`), so a boxed error is used
/// to cover both the PEM-parsing failure and the JWT-encoding failure without
/// depending on jsonwebtoken's internal `ErrorKind` variants.
pub fn create_offline_grant(
    subject: OfflineGrantSubject,
    private_key_pem: &str,
    lifetime_days: i64,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();
    let offline_until = now + Duration::days(lifetime_days);
    let claims = OfflineGrantClaims {
        grant_id: Uuid::new_v4(),
        user_id: subject.user_id,
        display_name: subject.display_name,
        email: subject.email,
        device_id: subject.device_id,
        baseline_role: subject.baseline_role,
        business_ids: subject.business_ids,
        business_unit_ids: subject.business_unit_ids,
        permissions: subject.permissions,
        authorization_version: subject.authorization_version,
        issued_at: now.to_rfc3339(),
        offline_until: offline_until.to_rfc3339(),
        iat: now.timestamp() as usize,
        exp: offline_until.timestamp() as usize,
    };

    let der = pem::parse(private_key_pem)?;
    let encoding_key = EncodingKey::from_ec_der(der.contents());

    Ok(encode(&Header::new(Algorithm::ES256), &claims, &encoding_key)?)
}

/// Verifies an access token and returns its claims.
pub fn verify_access_token(
    token: &str,
    secret: &str,
) -> Result<AccessTokenClaims, jsonwebtoken::errors::Error> {
    let token_data = decode::<AccessTokenClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}
