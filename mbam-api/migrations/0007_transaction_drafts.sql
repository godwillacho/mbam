create table transaction_drafts (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  recorded_by_user_id uuid not null references users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transaction_drafts_owner_time
  on transaction_drafts (recorded_by_user_id, updated_at desc);
