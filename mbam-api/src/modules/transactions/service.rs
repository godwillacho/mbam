use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{CreateTransactionRequest, TransactionResponse},
    repository,
};

pub async fn create(
    db: &PgPool,
    user_id: Uuid,
    mut payload: CreateTransactionRequest,
) -> Result<TransactionResponse, ApiError> {
    payload.customer_name = payload.customer_name.trim().to_string();
    payload.customer_contact = payload
        .customer_contact
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if payload.customer_name.is_empty() || payload.customer_name.len() > 80 {
        return Err(ApiError::BadRequest(
            "customer name is required and must be 80 characters or fewer".to_string(),
        ));
    }
    if !matches!(
        payload.payment_method.as_str(),
        "cash" | "mobile_money" | "card" | "bank_transfer"
    ) {
        return Err(ApiError::BadRequest(
            "payment method is invalid".to_string(),
        ));
    }
    let payment_status = payload.payment_status.as_deref().unwrap_or("paid");
    if !matches!(payment_status, "paid" | "pending") {
        return Err(ApiError::BadRequest(
            "payment status is invalid".to_string(),
        ));
    }
    if payload.lines.is_empty() {
        return Err(ApiError::BadRequest(
            "transaction requires at least one line".to_string(),
        ));
    }
    let mut total = 0.0;
    for line in &mut payload.lines {
        line.product_name = line.product_name.trim().to_string();
        if line.product_name.is_empty()
            || !line.quantity.is_finite()
            || line.quantity <= 0.0
            || !line.unit_price.is_finite()
            || line.unit_price < 0.0
        {
            return Err(ApiError::BadRequest(
                "transaction lines require a name, positive quantity, and valid price".to_string(),
            ));
        }
        total += line.quantity * line.unit_price;
    }
    let outstanding = payload.outstanding_amount.unwrap_or(0.0);
    if !total.is_finite() || total <= 0.0 || outstanding < 0.0 || outstanding > total {
        return Err(ApiError::BadRequest(
            "transaction totals are invalid".to_string(),
        ));
    }
    let account_id = repository::permitted_account_id(
        db,
        user_id,
        payload.business_id,
        payload.business_unit_id,
        "sale.create",
    )
    .await?
    .ok_or(ApiError::Forbidden)?;
    Ok(repository::create(db, user_id, account_id, &payload, total).await?)
}

pub async fn list(db: &PgPool, user_id: Uuid) -> Result<Vec<TransactionResponse>, ApiError> {
    Ok(repository::list_for_user(db, user_id).await?)
}

pub async fn find(
    db: &PgPool,
    user_id: Uuid,
    transaction_id: Uuid,
) -> Result<TransactionResponse, ApiError> {
    repository::find_by_id(db, user_id, transaction_id)
        .await?
        .ok_or(ApiError::NotFound)
}
