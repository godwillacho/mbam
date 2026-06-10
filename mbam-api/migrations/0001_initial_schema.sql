-- Initial Mbam schema.
-- This migration defines the multi-tenant account model used by master owners,
-- businesses, shops or units, workers, roles, permissions, and auth sessions.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  password_hash text,
  email_verified boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'disabled', 'pending'))
);

create table auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  provider_email text,
  created_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);

create table business_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references users(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_accounts_status_check check (status in ('active', 'disabled'))
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  name text not null,
  business_type text,
  country text,
  currency text not null default 'XAF',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint businesses_status_check check (status in ('active', 'disabled'))
);

create table business_units (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  unit_type text not null default 'shop',
  location text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_units_status_check check (status in ('active', 'disabled'))
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid references business_accounts(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  unique(business_account_id, code)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  business_unit_id uuid references business_units(id) on delete cascade,
  role_id uuid not null references roles(id),
  status text not null default 'active',
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_status_check check (status in ('active', 'disabled', 'invited')),
  constraint memberships_scope_check check (
    business_id is not null or business_unit_id is null
  )
);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  business_unit_id uuid references business_units(id) on delete cascade,
  role_id uuid not null references roles(id),
  invited_by uuid not null references users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint invitations_status_check check (status in ('pending', 'accepted', 'expired', 'cancelled'))
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  business_account_id uuid references business_accounts(id),
  business_id uuid references businesses(id),
  business_unit_id uuid references business_units(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_memberships_user_id on memberships(user_id);
create index idx_memberships_account_scope on memberships(business_account_id, business_id, business_unit_id);
create index idx_businesses_account_id on businesses(business_account_id);
create index idx_business_units_business_id on business_units(business_id);
create index idx_audit_logs_account_time on audit_logs(business_account_id, created_at desc);
