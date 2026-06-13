create table transactions (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  business_unit_id uuid references business_units(id) on delete set null,
  customer_name text not null,
  customer_contact text,
  payment_method text not null,
  payment_status text not null default 'paid',
  status text not null default 'completed',
  outstanding_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null,
  recorded_by_user_id uuid not null references users(id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_payment_method_check check (
    payment_method in ('cash', 'mobile_money', 'card', 'bank_transfer')
  ),
  constraint transactions_payment_status_check check (
    payment_status in ('paid', 'pending')
  ),
  constraint transactions_status_check check (
    status in ('completed', 'queued', 'refunded')
  ),
  constraint transactions_amount_check check (
    total_amount > 0 and outstanding_amount >= 0 and outstanding_amount <= total_amount
  )
);

create table transaction_lines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  quantity numeric(14, 3) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  constraint transaction_lines_values_check check (
    quantity > 0 and unit_price >= 0 and line_total >= 0
  )
);

create index idx_transactions_scope_time
  on transactions (business_account_id, business_id, business_unit_id, created_at desc);
create index idx_transactions_recorded_by
  on transactions (recorded_by_user_id, created_at desc);
create index idx_transaction_lines_transaction
  on transaction_lines (transaction_id);

