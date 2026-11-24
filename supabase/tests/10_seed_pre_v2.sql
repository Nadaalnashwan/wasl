-- Synthetic "existing production" rows created BEFORE the v2 migration (after 0001 + 0002), so the test can prove
-- that 0003+ keep every existing record, id and secret intact. All values are fake.
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', now()),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test', null);

insert into public.users (id, email, full_name) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', 'Alice Example'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test', 'Bob Example');

insert into public.achievements (id, user_id, title) values
  ('a1', '11111111-1111-1111-1111-111111111111', 'Alice achievement'),
  ('b1', '22222222-2222-2222-2222-222222222222', 'Bob achievement');
insert into public.cvs (id, user_id, data) values ('cv-a', '11111111-1111-1111-1111-111111111111', '{"summary":"x"}');
insert into public.cv_versions (cv_id, user_id, version, data) values ('cv-a', '11111111-1111-1111-1111-111111111111', 1, '{}');
insert into public.posts (user_id, content) values ('11111111-1111-1111-1111-111111111111', 'draft');
insert into public.integrations (user_id, provider, access_token_enc) values ('11111111-1111-1111-1111-111111111111', 'github', 'gAAAA-fake-ciphertext');
insert into public.user_api_keys (user_id, provider, key_enc, key_hint) values ('11111111-1111-1111-1111-111111111111', 'groq', 'gAAAA-fake', '…abcd');
insert into public.ai_events (request_id, task, provider, model, status, latency_ms) values ('r1', 'post', 'groq', 'm', 'ok', 100);
insert into public.eval_runs (dataset_version, summary) values ('v1', '{}');
insert into public.saved_jobs (id, user_id, listing_id) values ('sj1', '11111111-1111-1111-1111-111111111111', null);

create table if not exists public._pre_counts as
  select 'users' t, count(*) n from public.users union all select 'achievements', count(*) from public.achievements
  union all select 'cvs', count(*) from public.cvs union all select 'cv_versions', count(*) from public.cv_versions
  union all select 'posts', count(*) from public.posts union all select 'integrations', count(*) from public.integrations
  union all select 'user_api_keys', count(*) from public.user_api_keys union all select 'ai_events', count(*) from public.ai_events
  union all select 'eval_runs', count(*) from public.eval_runs union all select 'saved_jobs', count(*) from public.saved_jobs;
revoke all on public._pre_counts from anon, authenticated;
