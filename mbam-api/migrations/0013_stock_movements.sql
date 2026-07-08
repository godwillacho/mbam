-- Stock management ledger. Products already carry a single available_quantity
-- per business unit (see 0005_products.sql / 0008_product_unit_scope.sql), so
-- this migration does not introduce a separate multi-location stock profile
-- table -- it adds an append-only audit trail of every change to that
-- quantity (docs/future-stock-management.md's "important design rule": stock
-- should never be changed by editing a number directly).
--
-- Quantity tracking stays opt-in per product: a product with
-- available_quantity = null is treated as untracked and is never touched by
-- this ledger or by sale-driven deduction.

alter table products
  add column if not exists stock_policy text not null default 'warn_when_low';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_stock_policy_check'
  ) then
    alter table products
      add constraint products_stock_policy_check
      check (stock_policy in ('allow_negative', 'warn_when_low', 'block_when_empty'));
  end if;
end $$;

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  business_account_id uuid not null references business_accounts(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  movement_type text not null,
  quantity_delta numeric(14, 3) not null,
  unit_cost numeric(14, 2),
  source_transaction_id uuid references transactions(id) on delete set null,
  source_receipt_import_id uuid,
  note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint stock_movements_type_check check (
    movement_type in (
      'opening_balance', 'purchase', 'sale', 'sale_refund', 'manual_adjustment',
      'transfer_in', 'transfer_out', 'damaged', 'expired', 'returned'
    )
  ),
  constraint stock_movements_quantity_delta_check check (quantity_delta <> 0)
);

create index idx_stock_movements_product_created
  on stock_movements (product_id, created_at desc);
create index idx_stock_movements_account_unit_created
  on stock_movements (business_account_id, business_unit_id, created_at desc);
create index idx_stock_movements_source_transaction
  on stock_movements (source_transaction_id)
  where source_transaction_id is not null;

insert into permissions (code, description) values
  ('stock.movement.create', 'Record manual stock movements (purchases, adjustments, transfers)'),
  ('stock.movement.view', 'View the stock movement ledger')
on conflict (code) do nothing;

-- master_owner roles are granted every permission once, at account-creation
-- time (see auth/repository.rs); existing master_owner roles created before
-- this migration need the two new permissions granted explicitly, matching
-- the pattern established in 0009_screen_permissions.sql.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.code = 'master_owner'
  and p.code in ('stock.movement.create', 'stock.movement.view')
on conflict do nothing;

-- business_admin and shop_manager also get these two permissions going
-- forward via team/repository.rs's standard_roles() list (self-healing the
-- next time ensure_standard_roles runs for an account, same as every other
-- standard-role permission addition in this codebase); no migration-side
-- grant is needed for those two roles. Cashiers intentionally do not get
-- stock.movement.create/view -- sale-driven deductions happen automatically
-- as part of sale.create, which cashiers already hold.
