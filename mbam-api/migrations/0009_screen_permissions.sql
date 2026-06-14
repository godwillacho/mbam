insert into permissions (code, description) values
  ('screen.record_transaction', 'Open the record transaction screen'),
  ('screen.transaction_drafts', 'Open the transaction drafts screen'),
  ('screen.transactions', 'Open the transactions screen'),
  ('screen.businesses', 'Open the businesses and shops screen'),
  ('screen.team', 'Open the team access screen'),
  ('screen.products', 'Open the products screen'),
  ('screen.reports', 'Open the reports screen')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.code = 'master_owner'
  and p.code like 'screen.%'
on conflict do nothing;
