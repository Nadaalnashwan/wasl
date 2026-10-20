-- Wasl schema for Supabase Postgres, with Row Level Security.
-- Apply with:  supabase db push   (or paste into the SQL editor)
--
-- Security model
-- * public.users.id = auth.users.id, every user-owned table has user_id and RLS "owner only" policies,
--   so any direct client access (anon/authenticated keys) only ever sees the caller's rows.
-- * The FastAPI backend connects with the database connection string (bypasses RLS) and enforces the same
--   user_id scoping in every query (app/deps.py: owned()). Monitoring tables are backend-only (no policies
--   for anon/authenticated => no client access at all).

create extension if not exists pgcrypto;

create table if not exists public.users (
  id varchar(36) primary key,
  email varchar(320) unique not null,
  password_hash varchar(255),
  full_name varchar(200) not null default '',
  headline varchar(300) not null default '',
  locale varchar(5) not null default 'en',
  ai_mode varchar(20) not null default 'platform',
  allow_platform_fallback boolean not null default true,
  allow_cross_provider boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  title varchar(300) not null,
  description text not null default '',
  category varchar(40) not null default 'project',
  source varchar(20) not null default 'manual',
  source_ref varchar(500),
  technologies json not null default '[]',
  skills json not null default '[]',
  impact text not null default '',
  evidence json not null default '[]',
  status varchar(20) not null default 'confirmed',
  contribution_note text not null default '',
  needs_contribution_confirmation boolean not null default false,
  fingerprint varchar(64) not null default '',
  confidence double precision not null default 1.0,
  occurred_on varchar(20) not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ix_achievements_user on public.achievements(user_id, status);
create index if not exists ix_achievements_fp on public.achievements(user_id, fingerprint);

create table if not exists public.posts (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  achievement_id varchar(36) references public.achievements(id) on delete set null,
  content text not null,
  tone varchar(30) not null default 'professional',
  language varchar(5) not null default 'en',
  hashtags json not null default '[]',
  status varchar(20) not null default 'draft',
  linkedin_post_urn varchar(200),
  publish_error text,
  publish_attempts integer not null default 0,
  published_at timestamptz,
  claim_check json not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ix_posts_user on public.posts(user_id, status);

create table if not exists public.cvs (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  kind varchar(20) not null default 'master',
  title varchar(300) not null default 'Master CV',
  data json not null default '{}',
  version integer not null default 1,
  parent_cv_id varchar(36),
  job_analysis_id varchar(36),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists ux_one_master_cv on public.cvs(user_id) where kind = 'master';

create table if not exists public.cv_versions (
  id varchar(36) primary key default gen_random_uuid()::text,
  cv_id varchar(36) not null references public.cvs(id) on delete cascade,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  version integer not null,
  data json not null,
  change_summary text not null default '',
  created_at timestamptz not null default now(),
  unique (cv_id, version)
);

create table if not exists public.cv_suggestions (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  cv_id varchar(36) not null references public.cvs(id) on delete cascade,
  achievement_id varchar(36) references public.achievements(id) on delete set null,
  base_version integer not null,
  draft_data json not null,
  changes json not null default '[]',
  rationale text not null default '',
  status varchar(20) not null default 'pending',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.job_analyses (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  kind varchar(20) not null,
  job_title varchar(300) not null default '',
  company varchar(300) not null default '',
  requirements json not null default '{}',
  result json not null default '{}',
  match_score double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  provider varchar(20) not null,
  access_token_enc text not null,          -- Fernet-encrypted by the backend
  expires_at timestamptz,
  scopes varchar(500) not null default '',
  account_id varchar(200) not null default '',
  account_name varchar(300) not null default '',
  status varchar(20) not null default 'connected',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.oauth_states (
  state varchar(100) primary key,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  provider varchar(20) not null,
  code_verifier varchar(200) not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.user_api_keys (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  provider varchar(20) not null,
  key_enc text not null,                   -- Fernet-encrypted by the backend
  key_hint varchar(12) not null,
  status varchar(20) not null default 'unverified',
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.uploads (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  filename varchar(300) not null,
  mime varchar(100) not null,
  size_bytes integer not null,
  sha256 varchar(64) not null,
  purpose varchar(20) not null,
  storage_path varchar(500) not null,
  text_chars integer not null default 0,
  injection_flags json not null default '[]',
  status varchar(20) not null default 'processed',
  created_at timestamptz not null default now()
);

create table if not exists public.repo_snapshots (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36) not null references public.users(id) on delete cascade,
  full_name varchar(300) not null,
  pushed_at varchar(40) not null default '',
  readme_sha varchar(64) not null default '',
  last_scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, full_name)
);

-- ------------------------------------------------------------- monitoring (backend only)
create table if not exists public.ai_events (
  id varchar(36) primary key default gen_random_uuid()::text,
  request_id varchar(36) not null,
  user_id varchar(36),
  task varchar(40) not null,
  provider varchar(20) not null,
  model varchar(100) not null,
  key_source varchar(10) not null default 'platform',
  attempt integer not null default 1,
  is_fallback boolean not null default false,
  status varchar(20) not null,
  error_type varchar(40),
  http_status integer,
  latency_ms integer not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  input_chars integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ix_ai_events_time on public.ai_events(created_at);
create index if not exists ix_ai_events_req on public.ai_events(request_id);

create table if not exists public.http_events (
  id serial primary key,
  method varchar(8) not null,
  route varchar(200) not null,
  status_code integer not null,
  latency_ms integer not null,
  user_id varchar(36),
  error_id varchar(36),
  created_at timestamptz not null default now()
);
create index if not exists ix_http_events_time on public.http_events(created_at);

create table if not exists public.quality_events (
  id varchar(36) primary key default gen_random_uuid()::text,
  user_id varchar(36),
  kind varchar(40) not null,
  task varchar(40) not null default '',
  outcome varchar(30) not null default '',
  value double precision,
  details json not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ix_quality_events_time on public.quality_events(created_at, kind);

create table if not exists public.error_logs (
  id varchar(36) primary key default gen_random_uuid()::text,
  route varchar(200) not null,
  error_type varchar(100) not null,
  message text not null,
  user_id varchar(36),
  created_at timestamptz not null default now()
);

create table if not exists public.eval_runs (
  id varchar(36) primary key default gen_random_uuid()::text,
  dataset_version varchar(40) not null,
  provider varchar(40) not null default '',
  model varchar(100) not null default '',
  summary json not null default '{}',
  cases json not null default '[]',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- Row Level Security
alter table public.users enable row level security;
create policy users_self on public.users for all to authenticated
  using (id = auth.uid()::text) with check (id = auth.uid()::text);

do $$
declare t text;
begin
  foreach t in array array['achievements','posts','cvs','cv_versions','cv_suggestions','job_analyses','uploads','repo_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text)', t || '_owner', t);
  end loop;
end $$;

-- Secrets tables: RLS enabled with NO client policies => only the backend (service connection) can read them.
alter table public.integrations enable row level security;
alter table public.user_api_keys enable row level security;
alter table public.oauth_states enable row level security;

-- Monitoring tables: backend only.
alter table public.ai_events enable row level security;
alter table public.http_events enable row level security;
alter table public.quality_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.eval_runs enable row level security;

-- ------------------------------------------------------------- Storage (private bucket, per-user folders)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wasl-uploads', 'wasl-uploads', false, 5242880,
        array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown'])
on conflict (id) do nothing;

create policy "own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'wasl-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
