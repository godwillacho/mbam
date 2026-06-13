use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{BusinessUnit, CreateBusinessUnitRequest, UpdateBusinessUnitRequest},
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
    if repository::name_exists(db, business_id, &name).await? {
        return Err(ApiError::BadRequest(
            "a business unit with this name already exists".to_string(),
        ));
    }}