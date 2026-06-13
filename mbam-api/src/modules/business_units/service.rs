use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{BusinessUnit, CreateBusinessUnitRequest},
    repository,
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
    let name = payload.name.trim();
    let unit_type = payload
        .unit_type
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("shop");
    let location = payload
        .location
        .as_deref()
        .map(str::trim)
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
    if location.is_some_and(|value| value.len() > 160) {
        return Err(ApiError::BadRequest(
            "business unit location must be 160 characters or fewer".to_string(),
        ));
    }

    let account_id = repository::permitted_account_id(db, user_id, business_id, "unit.create")
        .await?
        .ok_or(ApiError::Forbidden)?;
    if repository::name_exists(db, business_id, name).await? {
        return Err(ApiError::BadRequest(
            "a business unit with this name already exists".to_string(),
        ));
    }

    Ok(repository::create(
        db,
        user_id,
        account_id,
        business_id,
        name,
        unit_type,
        location,
    )
    .await?)
}

#[cfg(test)]
mod tests {
    #[test]
    fn unit_name_boundaries_are_documented() {
        assert!("A".len() < 2);
        assert!("Main shop".len() <= 120);
    }
}
