-- Wasl v2: admin role, audit log, alert incidents, AI traceability columns, role-escalation hardening.
-- Apply after 0002_jobs.sql:  supabase db push   (or paste into the SQL editor). Idempotent and ADDITIVE:
-- no table or column is dropped, no existing row is changed (every existing user keeps role 'user').
--
-- Security model
-- * The FastAPI backend enforces authorization in code (require_admin, owned()). Its direct Postgres
--   connection may bypass RLS, so RLS here is defence in depth for the anon/authenticated API keys.
-- * users.role can never be changed through the Supabase client: column privilege is revoked AND a trigger
--   rejects changes unless the session runs as a privileged backend role. Admins are provisioned only with
--   `python -m scripts.admin grant <email>` (backend, server-side).

-- ------------------------------------------------------------------ users.role
alter table public.users add column if not exists role varchar(16) not null default 'user';
do $$ begin
  alter table public.users add constraint users_role_check check (role in ('user', 'admin'));
exception when duplicate_object then null; end $$;
create index if not exists ix_users_role on public.users (role);

-- authenticated/anon clients must never write role (or id/email, which mirror auth.users)
revoke update (role) on public.users from authenticated, anon;

create or replace function public.wasl_protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'role changes are not permitted from this connection';
  end if;
  return new;
end $$;

drop trigger if exists trg_wasl_protect_role on public.users;
create trigger trg_wasl_protect_role before update on public.users
  for each row execute function public.wasl_protect_role();

-- inserts from clients must not self-assign admin
create or replace function public.wasl_default_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    new.role := 'user';
  end if;
  return new;
end $$;

drop trigger if exists trg_wasl_default_role on public.users;
create trigger trg_wasl_default_role before insert on public.users
  for each row execute function public.wasl_default_role();

-- ------------------------------------------------------------------ AI traceability (ai_events)
alter table public.ai_events add column if not exists returned_model varchar(120) not null default '';
alter table public.ai_events add column if not exists registry_version varchar(40) not null default '';
alter table public.ai_events add column if not exists est_cost_usd double precision;
alter table public.ai_events add column if not exists pricing_version varchar(40) not null default '';
alter table public.ai_events add column if not exists privacy_level varchar(20) not null default '';
alter table public.ai_events add column if not exists redactions integer not null default 0;

-- ------------------------------------------------------------------ evaluation runs
alter table public.eval_runs add column if not exists model varchar(200) not null default '';
alter table public.eval_runs add column if not exists kind varchar(20) not null default 'live';
alter table public.eval_runs add column if not exists verifier_version varchar(40) not null default '';
alter table public.eval_runs add column if not exists git_sha varchar(40) not null default '';

-- ------------------------------------------------------------------ admin audit log (backend only)
create table if not exists public.admin_audit_log (
  id varchar(36) primary key,
  actor_user_id varchar(36),
  actor_label varchar(100) not null default '',
  action varchar(40) not null,
  target_user_id varchar(36),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_admin_audit_log_action on public.admin_audit_log (action);
create index if not exists ix_admin_audit_log_actor on public.admin_audit_log (actor_user_id);
alter table public.admin_audit_log enable row level security;  -- no policies: backend only

-- ------------------------------------------------------------------ alert incidents (backend only)
create table if not exists public.alert_incidents (
  id varchar(36) primary key,
  key varchar(60) not null,
  severity varchar(20) not null,
  title varchar(300) not null,
  status varchar(20) not null default 'open',
  value double precision,
  threshold double precision,
  sample_size integer not null default 0,
  investigate text not null default '',
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  notify_status varchar(20) not null default 'pending',
  notify_attempts integer not null default 0,
  notified_at timestamptz,
  recovery_notified boolean not null default false,
  last_error varchar(300) not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_alert_incidents_key on public.alert_incidents (key);
create index if not exists ix_alert_incidents_status on public.alert_incidents (status);
alter table public.alert_incidents enable row level security;  -- no policies: backend only

-- ------------------------------------------------------------------ least privilege for client keys
-- Monitoring / secrets tables already have RLS with no policies (0001). Also remove table grants so a
-- misconfigured policy in the future cannot expose them to the public API keys.
revoke all on public.ai_events, public.http_events, public.quality_events, public.error_logs, public.eval_runs,
  public.admin_audit_log, public.alert_incidents, public.integrations, public.user_api_keys, public.oauth_states
  from anon, authenticated;
