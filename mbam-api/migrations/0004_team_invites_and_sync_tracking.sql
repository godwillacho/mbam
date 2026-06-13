insert into permissions (code, description) values
  ('worker.view', 'View workers inside the assigned scope'),
  ('worker.update', 'Update worker profile and access'),
  ('sync.pull', 'Download offline data inside the assigned scope'),
  ('sync.push', 'Upload offline changes inside the assigned scope')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.code = 'master_owner'
on conflict do nothing;

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_id uuid,
  direction text not null,
  cursor_received text,
  cursor_returned text,
  operation_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  status text not null,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint sync_runs_direction_check check (direction in ('pull', 'push')),
  constraint sync_runs_status_check check (status in ('started', 'completed', 'failed'))
);

create index idx_sync_runs_user_time on sync_runs(user_id, started_at desc);
create index idx_invitations_email_status on invitations(lower(email), status);
create index idx_invitations_scope on invitations(business_account_id, business_id, business_unit_id);
