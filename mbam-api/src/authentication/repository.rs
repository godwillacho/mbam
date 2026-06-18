use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

/// Resolves a verified Keycloak subject to an active local Mbam user.
///
/// Local users remain the stable foreign-key target for transactions and
/// memberships. Optional email linking exists only for controlled migrations and
/// requires Keycloak to assert that the email address is verified.
pub async fn resolve_keycloak_user(
    db: &PgPool,
    subject: &str,
    email: Option<&str>,
    email_verified: bool,
    allow_verified_email_linking: bool,
) -> Result<Uuid, ApiError> {
    if let Some(user_id) = find_user_by_keycloak_subject(db, subject).await? {
        return Ok(user_id);
    }

    if !allow_verified_email_linking || !email_verified {
        return Err(ApiError::Unauthorized);
    }

    let normalized_email = email
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase)
        .ok_or(ApiError::Unauthorized)?;
    let user_id = sqlx::query_scalar::<_, Uuid>(
        "select id from users where lower(email) = $1 and status = 'active'",
    )
    .bind(&normalized_email)
    .fetch_optional(db)
    .await?
    .ok_or(ApiError::Unauthorized)?;

    sqlx::query(
        r#"
        insert into auth_identities (user_id, provider, provider_user_id, provider_email)
        values ($1, 'keycloak', $2, $3)
        on conflict (provider, provider_user_id) do nothing
        "#,
    )
    .bind(user_id)
    .bind(subject)
    .bind(&normalized_email)
    .execute(db)
    .await?;

    find_user_by_keycloak_subject(db, subject)
        .await?
        .ok_or(ApiError::Unauthorized)
}

/// Lists active local role codes for a user across all active memberships.
///
/// The authentication layer uses these codes to ensure a Keycloak baseline role
/// does not grant access beyond the user's current Mbam business membership.
pub async fn active_role_codes(db: &PgPool, user_id: Uuid) -> Result<Vec<String>, ApiError> {
    Ok(sqlx::query_scalar::<_, String>(
        r#"
        select distinct r.code
        from memberships m
        join roles r on r.id = m.role_id
        where m.user_id = $1
          and m.status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await?)
}

/// Looks up an active local user through the immutable Keycloak subject claim.
async fn find_user_by_keycloak_subject(
    db: &PgPool,
    subject: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        select u.id
        from auth_identities identity
        join users u on u.id = identity.user_id
        where identity.provider = 'keycloak'
          and identity.provider_user_id = $1
          and u.status = 'active'
        "#,
    )
    .bind(subject)
    .fetch_optional(db)
    .await
}
