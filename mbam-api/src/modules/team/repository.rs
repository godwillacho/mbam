use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use super::model::{
    BusinessScopeResponse, InvitationDetailsResponse, PendingInvitationResponse, RoleResponse,
    TeamMemberResponse, UnitScopeResponse,
};

pub struct CreateInvitationParams<'a> {
    pub actor_id: Uuid,
    pub account_id: Uuid,
    pub email: &'a str,
    pub role_id: Uuid,
    pub business_id: Option<Uuid>,
    pub unit_id: Option<Uuid>,
    pub token_hash: &'a str,
    pub expires_at: DateTime<Utc>,
}

struct AuditEvent<'a> {
    actor_id: Uuid,
    account_id: Uuid,
    business_id: Option<Uuid>,
    unit_id: Option<Uuid>,
    action: &'a str,
    resource_type: &'a str,
    resource_id: Uuid,
}

#[derive(sqlx::FromRow)]
struct AcceptableInvitation {
    id: Uuid,
    email: String,
    business_account_id: Uuid,
    business_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
    role_id: Uuid,
    invited_by: Uuid,
}

pub async fn ensure_standard_roles(db: &PgPool, user_id: Uuid) -> Result<(), sqlx::Error> {
    let account_ids = sqlx::query_scalar::<_, Uuid>(
        "select distinct business_account_id from memberships where user_id = $1 and status = 'active'",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    for account_id in account_ids {
        let mut tx = db.begin().await?;
        for (code, name, description, permissions) in standard_roles() {
            let role_id = sqlx::query_scalar::<_, Uuid>(
                r#"
                insert into roles (business_account_id, code, name, description, is_system_role)
                values ($1, $2, $3, $4, true)
                on conflict (business_account_id, code)
                do update set name = excluded.name, description = excluded.description
                returning id
                "#,
            )
            .bind(account_id)
            .bind(code)
            .bind(name)
            .bind(description)
            .fetch_one(&mut *tx)
            .await?;

            sqlx::query(
                r#"
                insert into role_permissions (role_id, permission_id)
                select $1, id from permissions where code = any($2)
                on conflict do nothing
                "#,
            )
            .bind(role_id)
            .bind(permissions)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
    }
    Ok(())
}

fn standard_roles() -> Vec<(&'static str, &'static str, &'static str, Vec<&'static str>)> {
    vec![
        (
            "business_admin",
            "Business Admin",
            "Manage one business, its units, workers, reports, products, and sales.",
            vec![
                "business.view",
                "business.update",
                "unit.view",
                "unit.create",
                "unit.update",
                "worker.view",
                "worker.invite",
                "worker.update",
                "worker.disable",
                "role.assign",
                "sale.create",
                "sale.view",
                "sale.refund",
                "product.create",
                "product.update",
                "product.view",
                "report.view",
                "report.profit.view",
                "sync.pull",
                "sync.push",
                "screen.record_transaction",
                "screen.transaction_drafts",
                "screen.transactions",
                "screen.businesses",
                "screen.team",
                "screen.products",
                "screen.reports",
            ],
        ),
        (
            "shop_manager",
            "Shop Manager",
            "Manage operations, workers, products, sales, and reports in one unit.",
            vec![
                "business.view",
                "unit.view",
                "worker.view",
                "worker.invite",
                "worker.update",
                "worker.disable",
                "role.assign",
                "sale.create",
                "sale.view",
                "sale.refund",
                "product.create",
                "product.update",
                "product.view",
                "report.view",
                "sync.pull",
                "sync.push",
                "screen.record_transaction",
                "screen.transaction_drafts",
                "screen.transactions",
                "screen.businesses",
                "screen.team",
                "screen.products",
                "screen.reports",
            ],
        ),
        (
            "cashier",
            "Cashier",
            "Record sales and view data required for assigned work.",
            vec![
                "business.view",
                "unit.view",
                "sale.create",
                "sale.view",
                "product.view",
                "sync.pull",
                "sync.push",
                "screen.record_transaction",
                "screen.transaction_drafts",
                "screen.transactions",
                "screen.products",
            ],
        ),
    ]
}

pub async fn list_roles(db: &PgPool, user_id: Uuid) -> Result<Vec<RoleResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select
          r.id, r.code, r.name, r.description,
          coalesce(array_agg(p.code order by p.code) filter (where p.code is not null), array[]::text[]) as permissions
        from roles r
        left join role_permissions rp on rp.role_id = r.id
        left join permissions p on p.id = rp.permission_id
        where r.business_account_id in (
          select business_account_id from memberships where user_id = $1 and status = 'active'
        )
          and r.code <> 'master_owner'
        group by r.id
        order by r.name
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn list_members(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<TeamMemberResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct
          target.id, target.user_id, u.full_name, u.email, u.phone,
          target.role_id, r.code as role_code, r.name as role_name,
          target.business_account_id, target.business_id, target.business_unit_id,
          target.status, target.updated_at
        from memberships actor
        join memberships target on target.business_account_id = actor.business_account_id
          and (actor.business_id is null or target.business_id = actor.business_id)
          and (actor.business_unit_id is null or target.business_unit_id = actor.business_unit_id)
        join users u on u.id = target.user_id
        join roles r on r.id = target.role_id
        where actor.user_id = $1 and actor.status = 'active'
          and (
            target.user_id = actor.user_id
            or exists(
              select 1
              from role_permissions arp
              join permissions ap on ap.id = arp.permission_id
              where arp.role_id = actor.role_id and ap.code = 'worker.view'
            )
          )
        order by u.full_name, u.email
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn list_invitations(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<PendingInvitationResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct
          i.id, i.email, i.role_id, r.code as role_code, r.name as role_name,
          i.business_account_id, i.business_id, i.business_unit_id,
          i.status, i.expires_at, i.created_at
        from memberships actor
        join role_permissions arp on arp.role_id = actor.role_id
        join permissions ap on ap.id = arp.permission_id and ap.code = 'worker.view'
        join invitations i on i.business_account_id = actor.business_account_id
          and (actor.business_id is null or i.business_id = actor.business_id)
          and (actor.business_unit_id is null or i.business_unit_id = actor.business_unit_id)
        join roles r on r.id = i.role_id
        where actor.user_id = $1 and actor.status = 'active' and i.status = 'pending'
        order by i.created_at desc
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn list_businesses(
    db: &PgPool,
    user_id: Uuid,
) -> Result<Vec<BusinessScopeResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct b.id, b.name
        from memberships m
        join businesses b on b.business_account_id = m.business_account_id
          and (m.business_id is null or m.business_id = b.id)
        where m.user_id = $1 and m.status = 'active' and b.status = 'active'
        order by b.name
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn list_units(db: &PgPool, user_id: Uuid) -> Result<Vec<UnitScopeResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select distinct bu.id, bu.business_id, bu.name
        from memberships m
        join business_units bu on bu.business_account_id = m.business_account_id
          and (m.business_id is null or m.business_id = bu.business_id)
          and (m.business_unit_id is null or m.business_unit_id = bu.id)
        where m.user_id = $1 and m.status = 'active' and bu.status = 'active'
        order by bu.name
        "#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
}

pub async fn authorization_version(db: &PgPool, user_id: Uuid) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select coalesce((extract(epoch from max(changed_at)) * 1000)::bigint, 0)
        from (
          select updated_at as changed_at from memberships where user_id = $1
          union all
          select r.created_at from roles r join memberships m on m.role_id = r.id where m.user_id = $1
        ) changes
        "#,
    )
    .bind(user_id)
    .fetch_one(db)
    .await
}

pub async fn permitted_scope(
    db: &PgPool,
    user_id: Uuid,
    permission: &str,
    business_id: Option<Uuid>,
    business_unit_id: Option<Uuid>,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select m.business_account_id
        from memberships m
        join role_permissions rp on rp.role_id = m.role_id
        join permissions p on p.id = rp.permission_id and p.code = $2
        where m.user_id = $1 and m.status = 'active'
          and (m.business_id is null or m.business_id = $3)
          and (m.business_unit_id is null or m.business_unit_id = $4)
        order by (m.business_id is null) desc, (m.business_unit_id is null) desc
        limit 1
        "#,
    )
    .bind(user_id)
    .bind(permission)
    .bind(business_id)
    .bind(business_unit_id)
    .fetch_optional(db)
    .await
}

pub async fn validate_role_scope(
    db: &PgPool,
    account_id: Uuid,
    role_id: Uuid,
    business_id: Option<Uuid>,
    unit_id: Option<Uuid>,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1
          from roles r
          where r.id = $2 and r.business_account_id = $1 and r.code <> 'master_owner'
            and ($3::uuid is null or exists(
              select 1 from businesses b where b.id = $3 and b.business_account_id = $1 and b.status = 'active'
            ))
            and ($4::uuid is null or exists(
              select 1 from business_units bu
              where bu.id = $4 and bu.business_account_id = $1 and bu.business_id = $3 and bu.status = 'active'
            ))
        )
        "#,
    )
    .bind(account_id)
    .bind(role_id)
    .bind(business_id)
    .bind(unit_id)
    .fetch_one(db)
    .await
}

pub async fn role_is_assignable(
    db: &PgPool,
    account_id: Uuid,
    role_id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        select exists(
          select 1 from roles
          where id = $2 and business_account_id = $1
            and code <> 'master_owner'
            and code not like 'custom_member_%'
        )
        "#,
    )
    .bind(account_id)
    .bind(role_id)
    .fetch_one(db)
    .await
}

pub async fn can_assign_permissions(
    db: &PgPool,
    actor_id: Uuid,
    account_id: Uuid,
    permissions: &[String],
) -> Result<bool, sqlx::Error> {
    let granted: i64 = sqlx::query_scalar(
        r#"
        select count(distinct p.code)
        from memberships m
        join role_permissions rp on rp.role_id = m.role_id
        join permissions p on p.id = rp.permission_id
        where m.user_id = $1 and m.business_account_id = $2
          and m.status = 'active' and p.code = any($3)
        "#,
    )
    .bind(actor_id)
    .bind(account_id)
    .bind(permissions)
    .fetch_one(db)
    .await?;
    Ok(granted == permissions.len() as i64)
}

pub async fn upsert_custom_role(
    db: &PgPool,
    account_id: Uuid,
    membership_id: Uuid,
    member_name: &str,
    permissions: &[String],
) -> Result<Uuid, sqlx::Error> {
    let mut tx = db.begin().await?;
    let code = format!("custom_member_{}", membership_id.simple());
    let name = format!("Custom - {member_name}");
    let role_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into roles (business_account_id, code, name, description, is_system_role)
        values ($1, $2, $3, 'Custom screen access for one employee', false)
        on conflict (business_account_id, code)
        do update set name = excluded.name, description = excluded.description
        returning id
        "#,
    )
    .bind(account_id)
    .bind(code)
    .bind(name)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("delete from role_permissions where role_id = $1")
        .bind(role_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        r#"
        insert into role_permissions (role_id, permission_id)
        select $1, id from permissions where code = any($2)
        "#,
    )
    .bind(role_id)
    .bind(permissions)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(role_id)
}

pub async fn create_invitation(
    db: &PgPool,
    params: CreateInvitationParams<'_>,
) -> Result<PendingInvitationResponse, sqlx::Error> {
    let mut tx = db.begin().await?;
    sqlx::query(
        "update invitations set status = 'cancelled' where lower(email) = lower($1) and business_account_id = $2 and status = 'pending'",
    )
    .bind(params.email)
    .bind(params.account_id)
    .execute(&mut *tx)
    .await?;
    let invite = sqlx::query_as::<_, PendingInvitationResponse>(
        r#"
        with created as (
          insert into invitations (
            email, business_account_id, business_id, business_unit_id, role_id,
            invited_by, token_hash, expires_at, status
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          returning *
        )
        select c.id, c.email, c.role_id, r.code as role_code, r.name as role_name,
          c.business_account_id, c.business_id, c.business_unit_id,
          c.status, c.expires_at, c.created_at
        from created c join roles r on r.id = c.role_id
        "#,
    )
    .bind(params.email)
    .bind(params.account_id)
    .bind(params.business_id)
    .bind(params.unit_id)
    .bind(params.role_id)
    .bind(params.actor_id)
    .bind(params.token_hash)
    .bind(params.expires_at)
    .fetch_one(&mut *tx)
    .await?;
    audit(
        &mut tx,
        AuditEvent {
            actor_id: params.actor_id,
            account_id: params.account_id,
            business_id: params.business_id,
            unit_id: params.unit_id,
            action: "worker.invite",
            resource_type: "invitation",
            resource_id: invite.id,
        },
    )
    .await?;
    tx.commit().await?;
    Ok(invite)
}

pub async fn invitation_details(
    db: &PgPool,
    token_hash: &str,
) -> Result<Option<InvitationDetailsResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select i.id, i.email, r.name as role_name, b.name as business_name,
          bu.name as business_unit_name, i.expires_at, i.status
        from invitations i
        join roles r on r.id = i.role_id
        left join businesses b on b.id = i.business_id
        left join business_units bu on bu.id = i.business_unit_id
        where i.token_hash = $1
        "#,
    )
    .bind(token_hash)
    .fetch_optional(db)
    .await
}

pub async fn find_invitation(
    db: &PgPool,
    invitation_id: Uuid,
) -> Result<Option<PendingInvitationResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select i.id, i.email, i.role_id, r.code as role_code, r.name as role_name,
          i.business_account_id, i.business_id, i.business_unit_id,
          i.status, i.expires_at, i.created_at
        from invitations i join roles r on r.id = i.role_id
        where i.id = $1 and i.status = 'pending'
        "#,
    )
    .bind(invitation_id)
    .fetch_optional(db)
    .await
}

pub async fn user_email(db: &PgPool, user_id: Uuid) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("select email from users where id = $1 and status = 'active'")
        .bind(user_id)
        .fetch_optional(db)
        .await
}

pub async fn accept_invitation(
    db: &PgPool,
    user_id: Uuid,
    user_email: &str,
    token_hash: &str,
) -> Result<Option<TeamMemberResponse>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let invite = sqlx::query_as::<_, PendingInvitationResponse>(
        r#"
        select i.id, i.email, i.role_id, r.code as role_code, r.name as role_name,
          i.business_account_id, i.business_id, i.business_unit_id,
          i.status, i.expires_at, i.created_at
        from invitations i join roles r on r.id = i.role_id
        where i.token_hash = $1 and lower(i.email) = lower($2)
          and i.status = 'pending' and i.expires_at > now()
        for update
        "#,
    )
    .bind(token_hash)
    .bind(user_email)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(invite) = invite else {
        tx.rollback().await?;
        return Ok(None);
    };

    let membership_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into memberships (
          user_id, business_account_id, business_id, business_unit_id, role_id,
          status, invited_by
        )
        select $1, i.business_account_id, i.business_id, i.business_unit_id,
          i.role_id, 'active', i.invited_by
        from invitations i where i.id = $2
        returning id
        "#,
    )
    .bind(user_id)
    .bind(invite.id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("update invitations set status = 'accepted', accepted_at = now() where id = $1")
        .bind(invite.id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        AuditEvent {
            actor_id: user_id,
            account_id: invite.business_account_id,
            business_id: invite.business_id,
            unit_id: invite.business_unit_id,
            action: "invitation.accept",
            resource_type: "membership",
            resource_id: membership_id,
        },
    )
    .await?;
    tx.commit().await?;
    find_member(db, membership_id).await
}

pub async fn register_invited_user(
    db: &PgPool,
    full_name: &str,
    password_hash: &str,
    token_hash: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let invite = sqlx::query_as::<_, AcceptableInvitation>(
        r#"
        select id, email, business_account_id, business_id, business_unit_id, role_id, invited_by
        from invitations
        where token_hash = $1 and status = 'pending' and expires_at > now()
        for update
        "#,
    )
    .bind(token_hash)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(invite) = invite else {
        tx.rollback().await?;
        return Ok(None);
    };
    let exists: bool =
        sqlx::query_scalar("select exists(select 1 from users where lower(email) = lower($1))")
            .bind(&invite.email)
            .fetch_one(&mut *tx)
            .await?;
    if exists {
        tx.rollback().await?;
        return Ok(None);
    }

    let user_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into users (full_name, email, password_hash, email_verified, status)
        values ($1, lower($2), $3, false, 'active')
        returning id
        "#,
    )
    .bind(full_name)
    .bind(&invite.email)
    .bind(password_hash)
    .fetch_one(&mut *tx)
    .await?;
    let membership_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        insert into memberships (
          user_id, business_account_id, business_id, business_unit_id,
          role_id, status, invited_by
        ) values ($1, $2, $3, $4, $5, 'active', $6)
        returning id
        "#,
    )
    .bind(user_id)
    .bind(invite.business_account_id)
    .bind(invite.business_id)
    .bind(invite.business_unit_id)
    .bind(invite.role_id)
    .bind(invite.invited_by)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("update invitations set status = 'accepted', accepted_at = now() where id = $1")
        .bind(invite.id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        AuditEvent {
            actor_id: user_id,
            account_id: invite.business_account_id,
            business_id: invite.business_id,
            unit_id: invite.business_unit_id,
            action: "invitation.register",
            resource_type: "membership",
            resource_id: membership_id,
        },
    )
    .await?;
    tx.commit().await?;
    Ok(Some(user_id))
}

pub async fn find_member(
    db: &PgPool,
    membership_id: Uuid,
) -> Result<Option<TeamMemberResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select m.id, m.user_id, u.full_name, u.email, u.phone, m.role_id,
          r.code as role_code, r.name as role_name, m.business_account_id,
          m.business_id, m.business_unit_id, m.status, m.updated_at
        from memberships m join users u on u.id = m.user_id join roles r on r.id = m.role_id
        where m.id = $1
        "#,
    )
    .bind(membership_id)
    .fetch_optional(db)
    .await
}

pub async fn update_member(
    db: &PgPool,
    actor_id: Uuid,
    membership_id: Uuid,
    role_id: Uuid,
    business_id: Option<Uuid>,
    unit_id: Option<Uuid>,
    status: &str,
) -> Result<Option<TeamMemberResponse>, sqlx::Error> {
    let mut tx = db.begin().await?;
    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        update memberships set role_id = $2, business_id = $3, business_unit_id = $4,
          status = $5, updated_at = now()
        where id = $1
        returning id
        "#,
    )
    .bind(membership_id)
    .bind(role_id)
    .bind(business_id)
    .bind(unit_id)
    .bind(status)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(updated_id) = updated_id else {
        tx.rollback().await?;
        return Ok(None);
    };
    let member = find_member_tx(&mut tx, updated_id).await?;
    if let Some(member) = &member {
        audit(
            &mut tx,
            AuditEvent {
                actor_id,
                account_id: member.business_account_id,
                business_id: member.business_id,
                unit_id: member.business_unit_id,
                action: "worker.update",
                resource_type: "membership",
                resource_id: member.id,
            },
        )
        .await?;
    }
    tx.commit().await?;
    Ok(member)
}

async fn find_member_tx(
    tx: &mut Transaction<'_, Postgres>,
    membership_id: Uuid,
) -> Result<Option<TeamMemberResponse>, sqlx::Error> {
    sqlx::query_as(
        r#"
        select m.id, m.user_id, u.full_name, u.email, u.phone, m.role_id,
          r.code as role_code, r.name as role_name, m.business_account_id,
          m.business_id, m.business_unit_id, m.status, m.updated_at
        from memberships m join users u on u.id = m.user_id join roles r on r.id = m.role_id
        where m.id = $1
        "#,
    )
    .bind(membership_id)
    .fetch_optional(&mut **tx)
    .await
}

pub async fn cancel_invitation(
    db: &PgPool,
    actor_id: Uuid,
    invitation_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let row = sqlx::query_as::<_, (Uuid, Option<Uuid>, Option<Uuid>)>(
        r#"
        update invitations set status = 'cancelled'
        where id = $1 and status = 'pending'
        returning business_account_id, business_id, business_unit_id
        "#,
    )
    .bind(invitation_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((account_id, business_id, unit_id)) = row else {
        tx.rollback().await?;
        return Ok(false);
    };
    audit(
        &mut tx,
        AuditEvent {
            actor_id,
            account_id,
            business_id,
            unit_id,
            action: "worker.invite.cancel",
            resource_type: "invitation",
            resource_id: invitation_id,
        },
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    event: AuditEvent<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        insert into audit_logs (
          actor_user_id, business_account_id, business_id, business_unit_id,
          action, resource_type, resource_id
        ) values ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(event.actor_id)
    .bind(event.account_id)
    .bind(event.business_id)
    .bind(event.unit_id)
    .bind(event.action)
    .bind(event.resource_type)
    .bind(event.resource_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
