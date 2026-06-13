create table products (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'other',
  manufacturer text,
  brand text,
  variant text,
  package_size text,
  unit_of_measure text,
  barcode text,
  available_quantity numeric(14, 3),
  low_stock_threshold numeric(14, 3),
  expiry_date date,
  cost_price numeric(14, 2),
  default_price numeric(14, 2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_status_check check (status in ('active', 'disabled')),
  constraint products_quantity_check check (
    (available_quantity is null or available_quantity >= 0)
    and (low_stock_threshold is null or low_stock_threshold >= 0)
  ),
  constraint products_price_check check (cost_price is null or cost_price >= 0),
  constraint products_default_price_check check (default_price >= 0)
);

create unique index idx_products_business_sku
  on products (business_id, lower(sku))
  where sku is not null and status = 'active';
create unique index idx_products_business_barcode
  on products (business_id, barcode)
  where barcode is not null and status = 'active';
create index idx_products_account_business
  on products (business_account_id, business_id, updated_at);

