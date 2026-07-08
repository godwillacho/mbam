-- Adds the screen.stock permission so the new Stock UI (mbam-web
-- /stock route) can be gated the same way every other screen is (see
-- 0009_screen_permissions.sql for the original pattern). Manual
-- movement create/view permissions themselves were added in
-- 0013_stock_movements.sql -- this migration only adds the "may open the
-- screen" permission and grants it to existing master_owner roles.

insert into permissions (code, description) values
  ('screen.stock', 'Open the stock screen')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.code = 'master_owner'
  and p.code = 'screen.stock'
on conflict do nothing;

-- business_admin and shop_manager get screen.stock via
-- team/repository.rs's standard_roles() the next time ensure_standard_roles
-- runs for an account (same self-healing pattern as stock.movement.create/
-- view in 0013). Cashiers intentionally do not get it.
