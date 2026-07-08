use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

use super::{
    model::{StockMovement, StockMovementWriteRequest},
    repository,
};

/// Movement types a caller may record by hand through this API.
/// `"sale"` is deliberately excluded -- it is only ever written by
/// `transactions::service::create` as a side effect of recording a sale, so
/// the ledger can never drift from what was actually sold or be
/// double-counted by also being queued client-side.
const MANUAL_MOVEMENT_TYPES: &[&str] = &[
    "opening_balance",
    "purchase",
    "sale_refund",
    "manual_adjustment",
    "transfer_in",
    "transfer_out",
    "damaged",
    "expired",
    "returned",
];

pub async fn create_movement(
    db: &PgPool,
    user_id: Uuid,
    payload: StockMovementWriteRequest,
) -> Result<StockMovement, ApiError> {
    create_movement_with_id(db, user_id, Uuid::new_v4(), payload).await
}

/// Same validation and authorization as `create_movement`, but under a
/// caller-chosen id. Used by `sync::service` to replay a queued offline
/// movement under its original offline-generated id, so a retried push is
/// idempotent instead of double-applying -- see `repository::create`'s
/// doc comment for how that idempotency is enforced.
pub async fn create_movement_with_id(
    db: &PgPool,
    user_id: Uuid,
    movement_id: Uuid,
    mut payload: StockMovementWriteRequest,
) -> Result<StockMovement, ApiError> {
    validate(&mut payload)?;

    let scope = repository::find_product_scope(db, payload.product_id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let account_id = crate::modules::products::repository::permitted_scope(
        db,
        user_id,
        scope.business_id,
        scope.business_unit_id,
        "stock.movement.create",
    )
    .await?
    .ok_or(ApiError::Forbidden)?;

    repository::create(db, user_id, account_id, movement_id, &payload).await
}

pub async fn list(
    db: &PgPool,
    user_id: Uuid,
    product_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
) -> Result<Vec<StockMovement>, ApiError> {
    Ok(repository::list_for_user(db, user_id, product_id, business_unit_id).await?)
}

fn validate(payload: &mut StockMovementWriteRequest) -> Result<(), ApiError> {
    if !MANUAL_MOVEMENT_TYPES.contains(&payload.movement_type.as_str()) {
        return Err(ApiError::BadRequest(
            "movement type is invalid or not recordable by hand".to_string(),
        ));
    }
    if !payload.quantity_delta.is_finite() || payload.quantity_delta == 0.0 {
        return Err(ApiError::BadRequest(
            "quantity delta must be a non-zero finite number".to_string(),
        ));
    }
    if let Some(unit_cost) = payload.unit_cost {
        if !unit_cost.is_finite() || unit_cost < 0.0 {
            return Err(ApiError::BadRequest(
                "unit cost cannot be negative".to_string(),
            ));
        }
    }
    payload.note = payload
        .note
        .as_ref()
        .map(|note| note.trim().to_string())
        .filter(|note| !note.is_empty());
    if payload.note.as_ref().is_some_and(|note| note.len() > 240) {
        return Err(ApiError::BadRequest(
            "note must be 240 characters or fewer".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate, StockMovementWriteRequest};
    use uuid::Uuid;

    fn request(movement_type: &str, quantity_delta: f64) -> StockMovementWriteRequest {
        StockMovementWriteRequest {
            product_id: Uuid::new_v4(),
            movement_type: movement_type.to_string(),
            quantity_delta,
            unit_cost: None,
            source_receipt_import_id: None,
            note: None,
        }
    }

    #[test]
    fn accepts_a_valid_manual_movement() {
        assert!(validate(&mut request("purchase", 5.0)).is_ok());
    }

    #[test]
    fn rejects_sale_as_a_manual_movement_type() {
        let result = validate(&mut request("sale", 5.0));
        assert!(result.is_err(), "sale movements must only come from transactions::service::create");
    }

    #[test]
    fn rejects_an_unknown_movement_type() {
        assert!(validate(&mut request("bogus_type", 5.0)).is_err());
    }

    #[test]
    fn rejects_a_zero_quantity_delta() {
        assert!(validate(&mut request("purchase", 0.0)).is_err());
    }

    #[test]
    fn rejects_a_non_finite_quantity_delta() {
        assert!(validate(&mut request("purchase", f64::NAN)).is_err());
        assert!(validate(&mut request("purchase", f64::INFINITY)).is_err());
    }

    #[test]
    fn rejects_a_negative_unit_cost() {
        let mut payload = request("purchase", 5.0);
        payload.unit_cost = Some(-1.0);
        assert!(validate(&mut payload).is_err());
    }

    #[test]
    fn trims_and_blanks_out_an_empty_note() {
        let mut payload = request("purchase", 5.0);
        payload.note = Some("   ".to_string());
        validate(&mut payload).expect("valid payload");
        assert_eq!(payload.note, None);
    }
}
