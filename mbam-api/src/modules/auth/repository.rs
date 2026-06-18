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
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PasswordResetRecord {
    pub id: Uuid,
    pub user_id: Uuid,
}

/// Current authorization scope embedded in a short-lived offline grant.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OfflineAuthorizationScope {
    pub business_ids: Vec<Uuid>,
    pub permissions: Vec<String>,
    pub authorization_version: i64,
}

/// Verified profile returned by an external identity provider.
pub struct OAuthIdentity<'a> {
    pub provider: &'a str,
    pub provider_user_id: &'a str,
    pub email: &'a str,
    pub full_name: &'a str,
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

/// Finds or creates a cloud user for a verified OAuth identity.
pub async fn find_or_create_oauth_user(
    db: &PgPool,
    identity: OAuthIdentity<'_>,
) -> Result<AuthUserRecord, sqlx::Error> {
    let mut tx = db.begin().await?;

    if let Some(user) = sqlx::query_as::<_, AuthUserRecord>(
        r#"
        select u.id, u.full_name, u.email, u.password_hash, u.email_verified
        from auth_identities ai
        join users u on u.id = ai.user_id
        where ai.provider = $1
          and ai.provider_user_id = $2
          and u.status = 'active'
        "#,
    )
    .bind(identity.provider)
    .bind(identity.provider_user_id)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.commit().await?;
        return Ok(user);
    }

    let existing_user = sqlx::query_as::<_, AuthUserRecord>(
        r#"
        select id, full_name, email, password_hash, email_verified
        from users
        where email = $1 and status = 'active'
        "#,
    )
    .bind(identity.email)
    .fetch_optional(&mut *tx)
    .await?;

    let user = if let Some(user) = existing_user {
        sqlx::query(
            r#"
            update users
            set email_verified = true, updated_at = now()
            where id = $1
            "#,
        )
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
        AuthUserRecord {
            email_verified: true,
            ..user
        }
    } else {
        let user = sqlx::query_as::<_, AuthUserRecord>(
            r#"
            insert into users (
              full_name,
              email,
              password_hash,
              email_verified,
              status
            )
            values ($1, $2, null, true, 'active')
            returning id, full_name, email, password_hash, email_verified
            "#,
        )
        .bind(identity.full_name)
        .bind(identity.email)
        .fetch_one(&mut *tx)
        .await?;

        create_master_account(&mut tx, &user).await?;
        user
    };

    sqlx::query(
        r#"
        insert into auth_identities (
          user_id,
          provider,
          provider_user_id,
          provider_email
        )
        values ($1, $2, $3, $4)
        on conflict (provider, provider_user_id) do nothing
        "#,
    )
    .bind(user.id)
    .bind(identity.provider)
    .bind(identity.provider_user_id)
    .bind(identity.email)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(user)
}

async fn create_master_account(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user: &AuthUserRecord,
) -> Result<(), sqlx::Error> {
    let business_account_id: Uuid = sqlx::query(
        r#"
        insert into business_accounts (name, owner_user_id, status)
        values ($1, $2, 'active')
        returning id
        "#,
    )
    .bind(format!("{}'s master account", user.full_name))
    .bind(user.id)
    .fetch_one(&mut **tx)
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
    .fetch_one(&mut **tx)
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
    .execute(&mut **tx)
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
    .execute(&mut **tx)
    .await?;

    Ok(())
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
        select id, user_id
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

pub async fn store_password_reset_token(
    db: &PgPool,
    user_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    sqlx::query(
        r#"
        update password_reset_tokens
        set used_at = now()
        where user_id = $1 and used_at is null
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        insert into password_reset_tokens (user_id, token_hash, expires_at)
        values ($1, $2, $3)
        "#,
    )
    .bind(user_id)
    .bind(token_hash)
    .bind(expires_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

pub async fn consume_password_reset_token(
    db: &PgPool,
    token_hash: &str,
    password_hash: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let record = sqlx::query_as::<_, PasswordResetRecord>(
        r#"
        select id, user_id
        from password_reset_tokens
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        for update
        "#,
    )
    .bind(token_hash)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(record) = record else {
        tx.rollback().await?;
        return Ok(false);
    };

    sqlx::query(
        r#"
        update users
        set password_hash = $1, updated_at = now()
        where id = $2 and status = 'active'
        "#,
    )
    .bind(password_hash)
    .bind(record.user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("update password_reset_tokens set used_at = now() where id = $1")
        .bind(record.id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        r#"
        update refresh_tokens
        set revoked_at = now()
        where user_id = $1 and revoked_at is null
        "#,
    )
    .bind(record.user_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(true)
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
