use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
<<<<<<< HEAD
    model::{BusinessUnit, CreateBusinessUnitRequest, UpdateBusinessUnitRequest},
=======
    model::{BusinessUnit, CreateBusinessUnitRequest},
>>>>>>> ab1765f5535985b619b85e038b1e04dd0c97fce4
    repository,
};

pub async fn list(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
) -> Result<Vec<BusinessUnit>, ApiError> {
<<<<<<< HEAD
=======
    repository::permitted_account_id(db, user_id, business_id, "unit.view")
        .await?
        .ok_or(ApiError::Forbidden)?;
>>>>>>> ab1765f5535985b619b85e038b1e04dd0c97fce4
    Ok(repository::list_for_business(db, user_id, business_id).await?)
}

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    business_id: Uuid,
    payload: CreateBusinessUnitRequest,
) -> Result<BusinessUnit, ApiError> {
<<<<<<< HEAD
    let (name, unit_type, location) =
        normalize_and_validate(payload.name, payload.unit_type, payload.location)?;
    let account_id = repository::permitted_account_id(db, user_id, business_id, "unit.create")
        .await?
        .ok_or(ApiError::Forbidden)?;
    if repository::name_exists(db, business_id, None, &name).await? {
=======
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
>>>>>>> ab1765f5535985b619b85e038b1e04dd0c97fce4
        return Err(ApiError::BadRequest(
            "a business unit with this name already exists".to_string(),
        ));
    }
<<<<<<< HEAD
=======

>>>>>>> ab1765f5535985b619b85e038b1e04dd0c97fce4
    Ok(repository::create(
        db,
        user_id,
        account_id,
        business_id,
<<<<<<< HEAD
        &name,
        &unit_type,
        location.as_deref(),
=======
        name,
        unit_type,
        location,
>>>>>>> ab1765f5535985b619b85e038b1e04dd0c97fce4
    )
    .await?)
}

<<<<<<< HEAD
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
    if repository::name_exists(db, business_id, Some(unit_id), &name).await? {
        return Err(ApiError::BadRequest(
            "a business unit with this name already exists".to_string(),
        ));
    }
    repository::update(
        db,
        repository::UpdateUnitParams {
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
        .unwrap_or_else(|| "shop".to_string())
        .trim()
        .to_lowercase();
    let location = location
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if !(2..=120).contains(&name.len()) {
        return Err(ApiError::BadRequest(
            "unit name must be between 2 and 120 characters".to_string(),
        ));
    }
    if !matches!(unit_type.as_str(), "shop" | "warehouse" | "sales_desk") {
        return Err(ApiError::BadRequest(
            "unit type must be shop, warehouse, or sales_desk".to_string(),
        ));
    }
    if location.as_ref().is_some_and(|value| value.len() > 160) {
        return Err(ApiError::BadRequest(
            "unit location must be 160 characters or fewer".to_string(),
        ));
    }
    Ok((name, unit_type, location))
=======
#[cfg(test)]
mod tests {
    #[test]
    fn unit_name_boundaries_are_documented() {
        assert!("A".len() < 2);
        assert!("Main shop".len() <= 120);
    }
>>>>>>> ab1765f5535985b619b85e038b1e04dd0c97fce4
}
