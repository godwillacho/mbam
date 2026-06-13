use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{BusinessUnit, CreateBusinessUnitRequest, UpdateBusinessUnitRequest},
    repository::{self, UpdateUnitParams},
};

pub async fn list(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
) -> Result<Vec<BusinessUnit>, ApiError> {
    repository::permitted_account_id(db, user_id, business_id, "unit.view")
        .await?
        .ok_or(ApiError::Forbidden)?;
    Ok(repository::list_for_business(db, user_id, business_id).await?)
}

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    payload: CreateBusinessUnitRequest,
) -> Result<BusinessUnit, ApiError> {
    let (name, unit_type, location) =
        normalize_and_validate(payload.name, payload.unit_type, payload.location)?;
    let account_id = repository::permitted_account_id(db, user_id, business_id, "unit.create")
        .await?
        .ok_or(ApiError::Forbidden)?;

    if repository::name_exists(db, business_id, &name).await? {
        return Err(ApiError::BadRequest(
            "a business unit with this name already exists".to_string(),
        ));
    }

    Ok(repository::create(
        db,
        user_id,
        account_id,
        business_id,
        &name,
        &unit_type,
        location.as_deref(),
    )
    .await?)
}

pub async fn update(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    unit_id: Uuid,
    payload: UpdateBusinessUnitRequest,
) -> Result<BusinessUnit, ApiError> {
    let (name, unit_type, location) =
        normalize_and_validate(payload.name, payload.unit_type, payload.location)?;
    let status = payload.status.as_deref().unwrap_or("active");

    if !matches!(status, "active" | "disabled") {
        return Err(ApiError::BadRequest(
            "unit status must be active or disabled".to_string(),
        ));
    }

    let account_id = repository::permitted_account_id(db, user_id, business_id, "unit.update")
        .await?
        .ok_or(ApiError::Forbidden)?;

    if repository::name_exists_for_other_unit(db, business_id, unit_id, &name).await? {
        return Err(ApiError::BadRequest(
            "a business unit with this name already exists".to_string(),
        ));
    }

    repository::update(
        db,
        UpdateUnitParams {
            actor_id: user_id,
            account_id,
            business_id,
            unit_id,
            name: &name,
            unit_type: &unit_type,
            location: location.as_deref(),
            status,
        },
    )
    .await?
    .ok_or(ApiError::NotFound)
}

fn normalize_and_validate(
    name: String,
    unit_type: Option<String>,
    location: Option<String>,
) -> Result<(String, String, Option<String>), ApiError> {
    let name = name.trim().to_string();
    let unit_type = unit_type
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("shop")
        .to_string();
    let location = location
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if !(2..=120).contains(&name.len()) {
        return Err(ApiError::BadRequest(
            "business unit name must be between 2 and 120 characters".to_string(),
        ));
    }
    if unit_type.len() > 80 {
        return Err(ApiError::BadRequest(
            "business unit type must be 80 characters or fewer".to_string(),
        ));
    }
    if location.as_ref().is_some_and(|value| value.len() > 160) {
        return Err(ApiError::BadRequest(
            "business unit location must be 160 characters or fewer".to_string(),
        ));
    }

    Ok((name, unit_type, location))
}

#[cfg(test)]
mod tests {
    use super::normalize_and_validate;

    #[test]
    fn normalizes_optional_unit_values() {
        let result = normalize_and_validate(
            " Main shop ".to_string(),
            Some(" ".to_string()),
            Some(" Downtown ".to_string()),
        )
        .expect("valid unit");

        assert_eq!(result.0, "Main shop");
        assert_eq!(result.1, "shop");
        assert_eq!(result.2.as_deref(), Some("Downtown"));
    }

    #[test]
    fn rejects_short_unit_names() {
        assert!(normalize_and_validate("A".to_string(), None, None).is_err());
    }
}
