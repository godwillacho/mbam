create table membership_business_scopes (
  membership_id uuid not null references memberships(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, business_id)
);

create table membership_business_unit_scopes (
  membership_id uuid not null references memberships(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, business_unit_id)
);

insert into membership_business_scopes (membership_id, business_id)
select id, business_id
from memberships
where business_id is not null
on conflict do nothing;

insert into membership_business_unit_scopes (membership_id, business_unit_id)
select id, business_unit_id
from memberships
where business_unit_id is not null
on conflict do nothing;

insert into business_units (business_account_id, business_id, name, unit_type, location, status)
select business.business_account_id, business.id, 'Default shop', 'shop', 'Created during product unit migration', 'active'
from businesses business
where not exists (
  select 1
  from business_units unit
  where unit.business_id = business.id
    and unit.status = 'active'
);

alter table products add column business_unit_id uuid references business_units(id) on delete restrict;

update products product
set business_unit_id = (
  select unit.id
  from business_units unit
  where unit.business_id = product.business_id
    and unit.status = 'active'
  order by unit.created_at, unit.id
  limit 1
);

alter table products alter column business_unit_id set not null;

drop index if exists idx_products_business_sku;
drop index if exists idx_products_business_barcode;

create unique index idx_products_unit_sku
  on products (business_unit_id, lower(sku))
  where sku is not null and status = 'active';
create unique index idx_products_unit_barcode
  on products (business_unit_id, barcode)
  where barcode is not null and status = 'active';
create index idx_products_account_unit
  on products (business_account_id, business_unit_id, updated_at);
create index idx_membership_business_scopes_business
  on membership_business_scopes (business_id, membership_id);
create index idx_membership_business_unit_scopes_unit
  on membership_business_unit_scopes (business_unit_id, membership_id);
