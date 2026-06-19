create table keycloak_role_outbox (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  desired_baseline_role text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'superseded')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    desired_baseline_role is null
    or desired_baseline_role in ('master_owner', 'business_admin', 'shop_manager', 'cashier')
  )
);

create index idx_keycloak_role_outbox_ready
  on keycloak_role_outbox(status, available_at, created_at)
  where status in ('pending', 'failed');

create index idx_keycloak_role_outbox_membership
  on keycloak_role_outbox(membership_id, created_at desc);
