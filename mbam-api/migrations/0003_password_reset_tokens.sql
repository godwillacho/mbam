create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_password_reset_tokens_user_id
  on password_reset_tokens(user_id);

create index idx_password_reset_tokens_active
  on password_reset_tokens(token_hash, expires_at)
  where used_at is null;
