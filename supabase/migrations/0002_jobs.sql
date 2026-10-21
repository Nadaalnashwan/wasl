-- Job recommendations (JSearch + SerpApi) for Wasl.
-- Apply after 0001_init.sql:  supabase db push   (or paste into the SQL editor). Idempotent.
--
-- Security model (same as 0001)
-- * job_profiles, user_job_feed, saved_jobs are user-owned: RLS "owner only" policies.
-- * job_listings, job_search_cache, job_api_calls are shared, backend-only tables: RLS enabled with NO policies,
--   so the anon/authenticated keys cannot read them; the FastAPI backend (connection string) bypasses RLS.

create table if not exists public.job_listings (
  id varchar(36) primary key,
  fingerprint varchar(64) not null unique,
  providers jsonb not null default '[]',
  external_ids jsonb not null default '{}',
  title varchar(300) not null,
  company varchar(300) not null default '',
  company_logo varchar(1000) not null default '',
  city varchar(100) not null default '',
  location varchar(300) not null default '',
  country varchar(5) not null default 'SA',
  employment_type varchar(20) not null default '',
  is_remote boolean not null default false,
  posted_at timestamptz,
  apply_url varchar(2000) not null default '',
  apply_options jsonb not null default '[]',
  salary varchar(200) not null default '',
  publisher varchar(100) not null default '',
  description text not null default '',
  requirements jsonb not null default '{}',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ix_job_listings_city on public.job_listings (city);
create index if not exists ix_job_listings_last_seen_at on public.job_listings (last_seen_at);

create table if not exists public.job_search_cache (
  id varchar(36) primary key,
  provider varchar(20) not null,
  query_key varchar(64) not null,
  query jsonb not null default '{}',
  listing_ids jsonb not null default '[]',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, query_key)
);

create table if not exists public.job_api_calls (
  id varchar(36) primary key,
  provider varchar(20) not null,
  month varchar(7) not null,
  user_id varchar(36),
  status varchar(20) not null,
  http_status integer,
  results integer not null default 0,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ix_job_api_calls_provider_month on public.job_api_calls (provider, month);

create table if not exists public.job_profiles (
  id varchar(36) primary key,
  user_id varchar(36) not null unique references public.users (id) on delete cascade,
  cv_hash varchar(64) not null,
  profile jsonb not null default '{}',
  source varchar(10) not null default 'rules',
  searched_hash varchar(64) not null default '',
  refreshed_at timestamptz,
  refresh_log jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.user_job_feed (
  id varchar(36) primary key,
  user_id varchar(36) not null references public.users (id) on delete cascade,
  listing_id varchar(36) not null references public.job_listings (id) on delete cascade,
  query varchar(300) not null default '',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create table if not exists public.saved_jobs (
  id varchar(36) primary key,
  user_id varchar(36) not null references public.users (id) on delete cascade,
  listing_id varchar(36) references public.job_listings (id) on delete set null,
  status varchar(20) not null default 'saved',
  notes text not null default '',
  snapshot jsonb not null default '{}',
  match_score double precision,
  applied_at timestamptz,
  tailored_cv_id varchar(36),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

do $$
declare t text;
begin
  foreach t in array array['job_profiles', 'user_job_feed', 'saved_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text)', t || '_owner', t);
  end loop;
  foreach t in array array['job_listings', 'job_search_cache', 'job_api_calls'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
