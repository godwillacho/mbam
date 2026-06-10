-- Seed auth and master-account permissions used by the first backend auth flow.
-- These records are safe to run repeatedly because they use conflict handling.

insert into permissions (code, description) values
  ('business.create', 'Create businesses inside a master account'),
  ('business.update', 'Update business settings'),
  ('business.view', 'View businesses'),
  ('unit.create', 'Create business units or shops'),
  ('unit.update', 'Update business units or shops'),
  ('unit.view', 'View business units or shops'),
  ('worker.invite', 'Invite workers'),
  ('worker.disable', 'Disable worker access'),
  ('role.assign', 'Assign roles to workers'),
  ('sale.create', 'Record sales'),
  ('sale.view', 'View sales'),
  ('sale.refund', 'Refund sales'),
  ('product.create', 'Create products'),
  ('product.update', 'Update products'),
  ('product.view', 'View products'),
  ('report.view', 'View reports'),
  ('report.profit.view', 'View profit reports'),
  ('settings.manage', 'Manage account and business settings')
on conflict (code) do nothing;
