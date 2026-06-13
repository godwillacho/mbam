//! Business validation and permission-aware operations.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{Business, CreateBusinessRequest},
    repository,
};

pub async fn list(db: &PgPool, user_id: Uuid) -> Result<Vec<Business>, ApiError> {
    Ok(repository::list_for_user(db, user_id).await?)
}

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    payload: CreateBusinessRequest,
) -> Result<Business, ApiError> {
    let name = payload.name.trim();
    let business_type = normalize_optional(payload.business_type.as_deref());
    let country = normalize_optional(payload.country.as_deref());
    let currency = payload.currency.trim().to_uppercase();

    validate(name, business_type, country, &currency)?;

    let business_account_id = repository::permitted_account_id(db, user_id, "business.create")
        .await?
        .ok_or(ApiError::Forbidden)?;

    if repository::name_exists(db, business_account_id, name).await? {
        return Err(ApiError::BadRequest(
            "a business with this name already exists".to_string(),
        ));
    }

    Ok(repository::create(
        db,
        user_id,
        business_account_id,
        name,
        business_type,
        country,
        &currency,
    )
    .await?)
}

fn normalize_optional(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn validate(
    name: &str,
    business_type: Option<&str>,
    country: Option<&str>,
    currency: &str,
) -> Result<(), ApiError> {
    if !(2..=120).contains(&name.len()) {
        return Err(ApiError::BadRequest(
            "business name must be between 2 and 120 characters".to_string(),
        ));
    }
    if business_type.is_some_and(|value| value.len() > 80) {
        return Err(ApiError::BadRequest(
            "business type must be 80 characters or fewer".to_string(),
        ));
    }
    if country.is_some_and(|value| value.len() > 80) {
        return Err(ApiError::BadRequest(
            "country must be 80 characters or fewer".to_string(),
        ));
    }
    if currency.len() != 3 || !currency.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return Err(ApiError::BadRequest(
            "currency must be a three-letter code".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn accepts_valid_business_input() {
        assert!(validate("Mbam Market", Some("retail"), Some("Cameroon"), "XAF").is_ok());
    }

    #[test]
    fn rejects_invalid_currency() {
        assert!(validate("Mbam Market", None, None, "XA").is_err());
        assert!(validate("Mbam Market", None, None, "12A").is_err());
    }

    #[test]
    fn rejects_short_name() {
        assert!(validate("M", None, None, "XAF").is_err());
    }
}
