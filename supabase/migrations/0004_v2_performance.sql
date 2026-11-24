-- Wasl v2: performance hardening suggested by the Supabase database linter (run locally, see supabase/tests).
-- Apply after 0003. Idempotent and additive: only CREATE INDEX IF NOT EXISTS and policy re-creation with the
-- SAME predicate. No data is touched.
--
-- 1. Indexes for foreign keys that had none (lint 0001_unindexed_foreign_keys). They speed up owner-scoped
--    queries and ON DELETE CASCADE from users / cvs / job_listings.
-- 2. RLS policies call auth.uid() once per statement instead of once per row (lint 0003_auth_rls_initplan) by
--    wrapping it in a scalar sub-select. The access rule is identical: owner only.

create index if not exists ix_posts_achievement on public.posts (achievement_id);
create index if not exists ix_cv_versions_user on public.cv_versions (user_id);
create index if not exists ix_cv_suggestions_user on public.cv_suggestions (user_id, status);
create index if not exists ix_cv_suggestions_cv on public.cv_suggestions (cv_id);
create index if not exists ix_cv_suggestions_achievement on public.cv_suggestions (achievement_id);
create index if not exists ix_job_analyses_user on public.job_analyses (user_id, created_at);
create index if not exists ix_oauth_states_user on public.oauth_states (user_id);
create index if not exists ix_uploads_user on public.uploads (user_id);
create index if not exists ix_user_job_feed_listing on public.user_job_feed (listing_id);
create index if not exists ix_saved_jobs_listing on public.saved_jobs (listing_id);

begin;
drop policy if exists users_self on public.users;
create policy users_self on public.users for all to authenticated
  using (id = (select auth.uid())::text) with check (id = (select auth.uid())::text);

do $$
declare t text;
begin
  foreach t in array array['achievements','posts','cvs','cv_versions','cv_suggestions','job_analyses','uploads',
                           'repo_snapshots','job_profiles','user_job_feed','saved_jobs']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())::text) '
                   'with check (user_id = (select auth.uid())::text)', t || '_owner', t);
  end loop;
end $$;

drop policy if exists "own folder read" on storage.objects;
create policy "own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'wasl-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
