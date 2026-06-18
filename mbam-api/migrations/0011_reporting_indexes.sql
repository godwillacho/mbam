-- Reporting indexes support authorized business, shop, employee, product, and
-- time-window aggregations without moving authoritative calculations to clients.

create index if not exists idx_transactions_business_created
  on transactions (business_id, created_at desc);

create index if not exists idx_transactions_unit_created
  on transactions (business_unit_id, created_at desc)
  where business_unit_id is not null;

create index if not exists idx_transactions_status_created
  on transactions (status, created_at desc);

create index if not exists idx_transaction_lines_product_transaction
  on transaction_lines (product_id, transaction_id)
  where product_id is not null;

insert into role_permissions (role_id, permission_id)
select role.id, permission.id
from roles role
join permissions permission
  on permission.code in ('report.view', 'screen.reports')
where role.code = 'cashier'
on conflict do nothing;
