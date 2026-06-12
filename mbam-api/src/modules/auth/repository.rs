//! Authentication database access.
//!
//! This repository owns SQL queries used by signup and login. Keeping SQL here
//! prevents route handlers from knowing database details.

use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

/// User record needed by authentication flows.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AuthUserRecord {
    pub id: Uuid,
    pub full_name: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub email_verified: bool,
}

/// Stored refresh token metadata.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RefreshTokenRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub expires_at: DateTime<Utc>,
}

/// Current authorization scope embedded in a short-lived offline grant.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OfflineAuthorizationScope {
    pub business_ids: Vec<Uuid>,
    pub permissions: Vec<String>,
    pub authorization_version: i64,
}

/// Finds a user by normalized email address.
pub async fn find_user_by_email(
    db: &PgPool,
    email: &str,
) -> Result<Option<AuthUserRecord>, sqlx::Error> {
    sqlx::query_as::<_, AuthUserRecord>(
        r#"
        select id, full_name, email, password_hash, email_verified
        from users
        where email = $1 and status = 'active'
        "#,
    )
    .bind(email)
    .fetch_optional(db)
    .await
}

/// Finds an active user by ID for refresh-token rotation.
pub async fn find_user_by_id(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Option<AuthUserRecord>, sqlx::Error> {
    sqlx::query_as::<_, AuthUserRecord>(
        r#"
        select id, full_name, email, password_hash, email_verified
        from users
        where id = $1 and status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
}

/// Creates a user, master account, master owner role, and account-level membership.
///
/// The first signup flow creates the user's private master account immediately so
/// the frontend can enter a usable workspace after authentication.
pub async fn create_user_with_master_account(
    db: &PgPool,
    full_name: &str,
    email: &str,
    phone: Option<&str>,
    password_hash: &str,
) -> Result<AuthUserRecord, sqlx::Error> {
    let mut tx = db.begin().await?;

    let user = sqlx::query_as::<_, AuthUserRecord>(
        r#"
        insert into users (full_name, email, phone, password_hash, email_verified, status)
        values ($1, $2, $3, $4, false, 'active')
        returning id, full_name, email, password_hash, email_verified
        "#,
    )
    .bind(full_name)
    .bind(email)
    .bind(phone)
    .bind(password_hash)
    .fetch_one(&mut *tx)
    .await?;

    let business_account_id: Uuid = sqlx::query(
        r#"
        insert into business_accounts (name, owner_user_id, status)
        values ($1, $2, 'active')
        returning id
        "#,
    )
    .bind(format!("{}'s master account", full_name))
    .bind(user.id)
    .fetch_one(&mut *tx)
    .await?
    .get("id");

    let role_id: Uuid = sqlx::query(
        r#"
        insert into roles (business_account_id, code, name, description, is_system_role)
        values ($1, 'master_owner', 'Master Owner', 'Full access to the master account', true)
        returning id
        "#,
    )
    .bind(business_account_id)
    .fetch_one(&mut *tx)
    .await?
    .get("id");

    sqlx::query(
        r#"
        insert into role_permissions (role_id, permission_id)
        select $1, id from permissions
        on conflict do nothing
        "#,
    )
    .bind(role_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        insert into memberships (user_id, business_account_id, role_id, status)
        values ($1, $2, $3, 'active')
        "#,
    )
    .bind(user.id)
    .bind(business_account_id)
    .bind(role_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(user)
}

/// Stores a hashed refresh token for later rotation or revocation.
pub async fn store_refresh_token(
    db: &PgPool,
    user_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<RefreshTokenRecord, sqlx::Error> {
    sqlx::query_as::<_, RefreshTokenRecord>(
        r#"
        insert into refresh_tokens (user_id, token_hash, expires_at)
        values ($1, $2, $3)
        returning id, user_id, expires_at
        "#,
    )
    .bind(user_id)
    .bind(token_hash)
    .bind(expires_at)
    .fetch_one(db)
    .await
}

/// Finds a valid, unrevoked refresh token by its hash.
pub async fn find_active_refresh_token(
    db: &PgPool,
    token_hash: &str,
) -> Result<Option<RefreshTokenRecord>, sqlx::Error> {
    sqlx::query_as::<_, RefreshTokenRecord>(
        r#"
        select id, user_id, expires_at
        from refresh_tokens
        where token_hash = $1
          and revoked_at is null
          and expires_at > now()
        "#,
    )
    .bind(token_hash)
    .fetch_optional(db)
    .await
}

/// Revokes one refresh token after rotation or logout.
pub async fn revoke_refresh_token(db: &PgPool, token_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        update refresh_tokens
        set revoked_at = now()
        where id = $1 and revoked_at is null
        "#,
    )
    .bind(token_id)
    .execute(db)
    .await?;
    Ok(())
}

/// Loads the user's current business scope and permission snapshot.
pub async fn get_offline_authorization_scope(
    db: &PgPool,
    user_id: Uuid,
) -> Result<OfflineAuthorizationScope, sqlx::Error> {
    sqlx::query_as::<_, OfflineAuthorizationScope>(
        r#"
        select
          coalesce(
            array_agg(distinct b.id) filter (where b.id is not null),
            array[]::uuid[]
          ) as business_ids,
          coalesce(
            array_agg(distinct p.code) filter (where p.code is not null),
            array[]::text[]
          ) as permissions,
          coalesce(extract(epoch from max(m.updated_at))::bigint, 0) as authorization_version
        from memberships m
        left join businesses b
          on b.business_account_id = m.business_account_id
         and (m.business_id is null or b.id = m.business_id)
         and b.status = 'active'
        left join role_permissions rp on rp.role_id = m.role_id
        left join permissions p on p.id = rp.permission_id
        where m.user_id = $1 and m.status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await
}
