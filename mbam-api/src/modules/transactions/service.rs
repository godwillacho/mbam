use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::{AuthorizationContext, BaselineRole},
    error::ApiError,
};

use super::{
    model::{
        CreateTransactionRequest, TransactionDraftPayload, TransactionDraftResponse,
        TransactionResponse,
    },
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

fn normalize_draft(
    mut payload: TransactionDraftPayload,
) -> Result<TransactionDraftPayload, ApiError> {
    payload.customer_name = payload.customer_name.map(|value| value.trim().to_string());
    payload.customer_contact = payload
        .customer_contact
        .map(|value| value.trim().to_string());
    payload.note = payload.note.map(|value| value.trim().to_string());
    if payload
        .customer_name
        .as_ref()
        .is_some_and(|value| value.len() > 80)
        || payload
            .customer_contact
            .as_ref()
            .is_some_and(|value| value.len() > 24)
        || payload.note.as_ref().is_some_and(|value| value.len() > 240)
        || payload.lines.len() > 100
    {
        return Err(ApiError::BadRequest(
            "draft fields exceed their limits".to_string(),
        ));
    }
    if payload
        .total_amount
        .is_some_and(|value| !value.is_finite() || value < 0.0)
        || payload
            .amount_paid
            .is_some_and(|value| !value.is_finite() || value < 0.0)
    {
        return Err(ApiError::BadRequest("amount paid is invalid".to_string()));
    }
    Ok(payload)
}

async fn draft_account_id(
    db: &PgPool,
    user_id: Uuid,
    payload: &TransactionDraftPayload,
) -> Result<Uuid, ApiError> {
    if let Some(business_id) = payload.business_id {
        return repository::permitted_account_id(
            db,
            user_id,
            business_id,
            payload.business_unit_id,
            "sale.create",
        )
        .await?
        .ok_or(ApiError::Forbidden);
    }
    repository::user_account_id(db, user_id)
        .await?
        .ok_or(ApiError::Forbidden)
}

pub async fn create_draft(
    db: &PgPool,
    user_id: Uuid,
    payload: TransactionDraftPayload,
) -> Result<TransactionDraftResponse, ApiError> {
    let payload = normalize_draft(payload)?;
    let account_id = draft_account_id(db, user_id, &payload).await?;
    Ok(repository::create_draft(db, user_id, account_id, &payload).await?)
}

pub async fn list_drafts(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<TransactionDraftResponse>, ApiError> {
    Ok(repository::list_drafts(db, user_id).await?)
}

pub async fn find_draft(
    db: &PgPool,
    user_id: Uuid,
    draft_id: Uuid,
) -> Result<TransactionDraftResponse, ApiError> {
    repository::find_draft(db, user_id, draft_id)
        .await?
        .ok_or(ApiError::NotFound)
}

pub async fn update_draft(
    db: &PgPool,
    user_id: Uuid,
    draft_id: Uuid,
    payload: TransactionDraftPayload,
) -> Result<TransactionDraftResponse, ApiError> {
    let payload = normalize_draft(payload)?;
    let account_id = draft_account_id(db, user_id, &payload).await?;
    repository::update_draft(db, user_id, draft_id, account_id, &payload)
        .await?
        .ok_or(ApiError::NotFound)
}

pub async fn delete_draft(db: &PgPool, user_id: Uuid, draft_id: Uuid) -> Result<(), ApiError> {
    if repository::delete_draft(db, user_id, draft_id).await? {
        Ok(())
    } else {
        Err(ApiError::NotFound)
    }
}

pub async fn list(db: &PgPool, user_id: Uuid) -> Result<Vec<TransactionResponse>, ApiError> {
    Ok(repository::list_for_user(db, user_id).await?)
}

/// Lists at most five newest transactions for cashier and shop-manager dashboards.
pub async fn recent(
    db: &PgPool,
    authorization: &AuthorizationContext,
) -> Result<Vec<TransactionResponse>, ApiError> {
    authorization.require_baseline_role(&[BaselineRole::ShopManager, BaselineRole::Cashier])?;
    authorization.require_permission("sale.view")?;
    Ok(repository::list_for_user_with_limit(db, authorization.user_id, Some(5)).await?)
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
