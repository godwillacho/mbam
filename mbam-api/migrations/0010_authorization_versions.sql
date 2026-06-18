-- Durable authorization versions invalidate online and offline authorization
-- snapshots whenever membership, role, permission, or scope state changes.

alter table users
  add column if not exists authorization_version bigint not null default 1;

create or replace function bump_user_authorization_version(target_user_id uuid)
returns void
language sql
as $$
  update users
  set authorization_version = authorization_version + 1,
      updated_at = now()
  where id = target_user_id;
$$;

create or replace function bump_membership_user_authorization_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform bump_user_authorization_version(old.user_id);
    return old;
  end if;

  perform bump_user_authorization_version(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform bump_user_authorization_version(old.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_authorization_version on memberships;
create trigger memberships_authorization_version
after insert or update or delete on memberships
for each row execute function bump_membership_user_authorization_version();

create or replace function bump_scope_user_authorization_version()
returns trigger
language plpgsql
as $$
declare
  affected_membership_id uuid;
  affected_user_id uuid;
begin
  affected_membership_id := case when tg_op = 'DELETE' then old.membership_id else new.membership_id end;
  select user_id into affected_user_id
  from memberships
  where id = affected_membership_id;

  if affected_user_id is not null then
    perform bump_user_authorization_version(affected_user_id);
  end if;
  if tg_op = 'UPDATE' and old.membership_id is distinct from new.membership_id then
    select user_id into affected_user_id
    from memberships
    where id = old.membership_id;
    if affected_user_id is not null then
      perform bump_user_authorization_version(affected_user_id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists membership_business_scopes_authorization_version
  on membership_business_scopes;
create trigger membership_business_scopes_authorization_version
after insert or update or delete on membership_business_scopes
for each row execute function bump_scope_user_authorization_version();

drop trigger if exists membership_business_unit_scopes_authorization_version
  on membership_business_unit_scopes;
create trigger membership_business_unit_scopes_authorization_version
after insert or update or delete on membership_business_unit_scopes
for each row execute function bump_scope_user_authorization_version();

create or replace function bump_role_users_authorization_version()
returns trigger
language plpgsql
as $$
declare
  affected_role_id uuid;
begin
  affected_role_id := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
  update users
  set authorization_version = authorization_version + 1,
      updated_at = now()
  where id in (
    select distinct user_id
    from memberships
    where role_id = affected_role_id
  );
  if tg_op = 'UPDATE' and old.role_id is distinct from new.role_id then
    update users
    set authorization_version = authorization_version + 1,
        updated_at = now()
    where id in (
      select distinct user_id
      from memberships
      where role_id = old.role_id
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists role_permissions_authorization_version on role_permissions;
create trigger role_permissions_authorization_version
after insert or update or delete on role_permissions
for each row execute function bump_role_users_authorization_version();

create or replace function bump_role_definition_authorization_version()
returns trigger
language plpgsql
as $$
begin
  update users
  set authorization_version = authorization_version + 1,
      updated_at = now()
  where id in (
    select distinct user_id
    from memberships
    where role_id = new.id
  );
  return new;
end;
$$;

drop trigger if exists roles_authorization_version on roles;
create trigger roles_authorization_version
after update of code, business_account_id on roles
for each row execute function bump_role_definition_authorization_version();

create or replace function bump_permission_definition_authorization_version()
returns trigger
language plpgsql
as $$
begin
  update users
  set authorization_version = authorization_version + 1,
      updated_at = now()
  where id in (
    select distinct membership.user_id
    from memberships membership
    join role_permissions role_permission
      on role_permission.role_id = membership.role_id
    where role_permission.permission_id = new.id
  );
  return new;
end;
$$;

drop trigger if exists permissions_authorization_version on permissions;
create trigger permissions_authorization_version
after update of code on permissions
for each row execute function bump_permission_definition_authorization_version();

create or replace function bump_account_scope_authorization_versions()
returns trigger
language plpgsql
as $$
declare
  new_account_id uuid;
  old_account_id uuid;
begin
  if tg_op <> 'DELETE' then
    new_account_id := new.business_account_id;
    update users
    set authorization_version = authorization_version + 1,
        updated_at = now()
    where id in (
      select distinct user_id
      from memberships
      where business_account_id = new_account_id
    );
  end if;

  if tg_op <> 'INSERT' then
    old_account_id := old.business_account_id;
    if tg_op = 'DELETE' or old_account_id is distinct from new_account_id then
      update users
      set authorization_version = authorization_version + 1,
          updated_at = now()
      where id in (
        select distinct user_id
        from memberships
        where business_account_id = old_account_id
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_authorization_version on businesses;
create trigger businesses_authorization_version
after insert or update or delete on businesses
for each row execute function bump_account_scope_authorization_versions();

drop trigger if exists business_units_authorization_version on business_units;
create trigger business_units_authorization_version
after insert or update or delete on business_units
for each row execute function bump_account_scope_authorization_versions();
