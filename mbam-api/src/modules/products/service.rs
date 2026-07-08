use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{BulkCreateProductsRequest, Product, ProductWriteRequest},
    repository,
};

pub async fn list(db: &PgPool, user_id: Uuid) -> Result<Vec<Product>, ApiError> {
    Ok(repository::list_for_user(db, user_id).await?)
}

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    mut payload: ProductWriteRequest,
) -> Result<Product, ApiError> {
    normalize_and_validate(&mut payload)?;
    let account_id = repository::permitted_scope(
        db,
        user_id,
        payload.business_id,
        payload.business_unit_id,
        "product.create",
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    ensure_unique(db, None, &payload).await?;
    Ok(repository::create(db, user_id, account_id, &payload).await?)
}

pub async fn create_bulk(
    db: &PgPool,
    user_id: Uuid,
    payload: BulkCreateProductsRequest,
) -> Result<Vec<Product>, ApiError> {
    if payload.products.is_empty() || payload.products.len() > 500 {
        return Err(ApiError::BadRequest(
            "bulk product requests require between 1 and 500 products".to_string(),
        ));
    }
    let mut created = Vec::with_capacity(payload.products.len());
    for product in payload.products {
        created.push(create(db, user_id, product).await?);
    }
    Ok(created)
}

pub async fn update(
    db: &PgPool,
    user_id: Uuid,
    product_id: Uuid,
    mut payload: ProductWriteRequest,
) -> Result<Product, ApiError> {
    normalize_and_validate(&mut payload)?;
    let existing = repository::find_visible(db, user_id, product_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    if existing.business_id != payload.business_id {
        return Err(ApiError::BadRequest(
            "a product cannot be moved to another business".to_string(),
        ));
    }
    let account_id = repository::permitted_scope(
        db,
        user_id,
        payload.business_id,
        payload.business_unit_id,
        "product.update",
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    ensure_unique(db, Some(product_id), &payload).await?;
    repository::update(db, user_id, account_id, product_id, &payload)
        .await?
        .ok_or(ApiError::NotFound)
}

pub async fn disable(db: &PgPool, user_id: Uuid, product_id: Uuid) -> Result<Product, ApiError> {
    let existing = repository::find_visible(db, user_id, product_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    let account_id = repository::permitted_scope(
        db,
        user_id,
        existing.business_id,
        existing.business_unit_id,
        "product.update",
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    repository::disable(db, user_id, account_id, product_id)
        .await?
        .ok_or(ApiError::NotFound)
}

async fn ensure_unique(
    db: &PgPool,
    product_id: Option<Uuid>,
    payload: &ProductWriteRequest,
) -> Result<(), ApiError> {
    if repository::duplicate_exists(
        db,
        payload.business_unit_id,
        product_id,
        payload.sku.as_deref(),
        payload.barcode.as_deref(),
    )
    .await?
    {
        return Err(ApiError::BadRequest(
            "another active product uses this SKU or barcode in this shop".to_string(),
        ));
    }
    Ok(())
}

fn normalize_and_validate(payload: &mut ProductWriteRequest) -> Result<(), ApiError> {
    payload.name = payload.name.trim().to_string();
    payload.sku = normalize_optional(payload.sku.take());
    payload.category = normalize_optional(payload.category.take());
    payload.manufacturer = normalize_optional(payload.manufacturer.take());
    payload.brand = normalize_optional(payload.brand.take());
    payload.variant = normalize_optional(payload.variant.take());
    payload.package_size = normalize_optional(payload.package_size.take());
    payload.unit_of_measure = normalize_optional(payload.unit_of_measure.take());
    payload.barcode = normalize_optional(payload.barcode.take());
    if !(2..=160).contains(&payload.name.len()) {
        return Err(ApiError::BadRequest(
            "product name must be between 2 and 160 characters".to_string(),
        ));
    }
    for value in [
        payload.available_quantity,
        payload.low_stock_threshold,
        payload.cost_price,
        payload.default_price,
    ]
    .into_iter()
    .flatten()
    {
        if !value.is_finite() || value < 0.0 {
            return Err(ApiError::BadRequest(
                "product quantities and prices cannot be negative".to_string(),
            ));
        }
    }
    if let Some(stock_policy) = &payload.stock_policy {
        if !matches!(
            stock_policy.as_str(),
            "allow_negative" | "warn_when_low" | "block_when_empty"
        ) {
            return Err(ApiError::BadRequest(
                "stock policy must be allow_negative, warn_when_low, or block_when_empty"
                    .to_string(),
            ));
        }
    }
    Ok(())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

#[cfg(test)]
mod tests {
    use super::normalize_and_validate;
    use crate::modules::products::model::ProductWriteRequest;
    use uuid::Uuid;

    fn request(name: &str) -> ProductWriteRequest {
        ProductWriteRequest {
            id: None,
            business_id: Uuid::new_v4(),
            business_unit_id: Uuid::new_v4(),
            name: name.to_string(),
            sku: None,
            category: None,
            manufacturer: None,
            brand: None,
            variant: None,
            package_size: None,
            unit_of_measure: None,
            barcode: None,
            available_quantity: Some(1.0),
            low_stock_threshold: None,
            expiry_date: None,
            cost_price: Some(2.0),
            default_price: Some(3.0),
            stock_policy: None,
        }
    }

    #[test]
    fn validates_products() {
        assert!(normalize_and_validate(&mut request("Coffee")).is_ok());
        assert!(normalize_and_validate(&mut request("x")).is_err());
    }

    #[test]
    fn validates_stock_policy() {
        let mut valid = request("Coffee");
        valid.stock_policy = Some("block_when_empty".to_string());
        assert!(normalize_and_validate(&mut valid).is_ok());

        let mut invalid = request("Coffee");
        invalid.stock_policy = Some("bogus_policy".to_string());
        assert!(normalize_and_validate(&mut invalid).is_err());
    }
}
