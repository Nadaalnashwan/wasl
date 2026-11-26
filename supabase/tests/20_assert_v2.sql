-- Assertions run AFTER all migrations. Each block raises on failure; the runner stops at the first error.
\set ON_ERROR_STOP on

-- 1. No existing row was lost or changed; every existing user got role 'user'.
do $$ declare r record; n bigint; begin
  for r in select * from public._pre_counts loop
    execute format('select count(*) from public.%I', r.t) into n;
    if n <> r.n then raise exception 'row count changed for %: % -> %', r.t, r.n, n; end if;
  end loop;
  if exists (select 1 from public.users where role <> 'user') then raise exception 'existing users must stay role=user'; end if;
  if (select access_token_enc from public.integrations limit 1) <> 'gAAAA-fake-ciphertext' then raise exception 'secret changed'; end if;
end $$;

-- helper: run a statement as a PostgREST client with a JWT for `sub`
create or replace function pg_temp.expect_fail(stmt text, who text, why text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok (blocked): % -> %', why, sqlerrm;
    return;
  end;
  raise exception 'NOT BLOCKED: % (% ran as %)', why, stmt, who;
end $$;

-- 2. An authenticated user cannot promote themself (UPDATE through the Data API).
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select pg_temp.expect_fail($q$update public.users set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$q$,
                           'authenticated', 'self-promotion via UPDATE');
-- 3. ... nor take over another identity column (email is used by the admin CLI to find the account).
select pg_temp.expect_fail($q$update public.users set email = 'someone-else@example.test' where id = '11111111-1111-1111-1111-111111111111'$q$,
                           'authenticated', 'email change via UPDATE');
-- 4. ... but can still edit their own profile fields.
update public.users set full_name = 'Alice Edited' where id = '11111111-1111-1111-1111-111111111111';
-- 5. ... and cannot see or edit another user's rows (RLS).
do $$ begin
  if (select count(*) from public.users) <> 1 then raise exception 'RLS: users leaked'; end if;
  if exists (select 1 from public.achievements where user_id <> '11111111-1111-1111-1111-111111111111') then raise exception 'RLS: achievements leaked'; end if;
end $$;
update public.achievements set title = 'hacked' where id = 'b1';  -- RLS: affects 0 rows
-- 6. Clients cannot create profile rows (the backend does) ...
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
select pg_temp.expect_fail($q$insert into public.users (id, email, role) values ('33333333-3333-3333-3333-333333333333', 'carol@example.test', 'admin')$q$,
                           'authenticated', 'client insert into users');
-- ... and even if INSERT were re-granted by mistake, the trigger forces role = 'user' (second layer).
reset role;
grant insert on public.users to authenticated;
set role authenticated;
insert into public.users (id, email, role) values ('33333333-3333-3333-3333-333333333333', 'carol@example.test', 'admin');
reset role;
revoke insert on public.users from authenticated;
-- ... and if UPDATE(role) were re-granted by mistake, the trigger still blocks self-promotion.
grant update on public.users to authenticated;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select pg_temp.expect_fail($q$update public.users set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$q$,
                           'authenticated', 'self-promotion with an over-broad grant (trigger layer)');
reset role;
revoke update on public.users from authenticated;
grant update (full_name, headline, locale, ai_mode, allow_platform_fallback, allow_cross_provider) on public.users to authenticated;
set role authenticated;
-- 7. Monitoring / secrets / admin tables are not readable through client keys at all.
select pg_temp.expect_fail('select count(*) from public.ai_events', 'authenticated', 'read ai_events');
select pg_temp.expect_fail('select count(*) from public.admin_audit_log', 'authenticated', 'read admin_audit_log');
select pg_temp.expect_fail('select count(*) from public.alert_incidents', 'authenticated', 'read alert_incidents');
select pg_temp.expect_fail('select count(*) from public.user_api_keys', 'authenticated', 'read user_api_keys');
select pg_temp.expect_fail('select count(*) from public.integrations', 'authenticated', 'read integrations');
select pg_temp.expect_fail('select count(*) from public.job_api_calls', 'authenticated', 'read job_api_calls');
reset role;

-- anon: nothing
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.expect_fail($q$update public.users set role = 'admin'$q$, 'anon', 'anon role update');
do $$ begin if (select count(*) from public.users) <> 0 then raise exception 'anon can read users'; end if; end $$;
reset role;

do $$ begin
  if (select role from public.users where id = '33333333-3333-3333-3333-333333333333') <> 'user' then
    raise exception 'insert self-assigned admin'; end if;
  if (select full_name from public.users where id = '11111111-1111-1111-1111-111111111111') <> 'Alice Edited' then
    raise exception 'profile edit was blocked'; end if;
  if (select title from public.achievements where id = 'b1') <> 'Bob achievement' then raise exception 'cross-user write'; end if;
end $$;

-- 8. The backend (direct connection, privileged role) CAN grant and revoke admin — the only path.
update public.users set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';
update public.users set role = 'user'  where id = '22222222-2222-2222-2222-222222222222';
-- service_role (server key through the Data API) may too.
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
update public.users set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';
update public.users set role = 'user'  where id = '22222222-2222-2222-2222-222222222222';
reset role;

-- 9. A forged JWT claim cannot impersonate service_role while connected as `authenticated`.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"service_role"}', false);
select set_config('request.jwt.claim.role', 'service_role', false);
select pg_temp.expect_fail($q$update public.users set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$q$,
                           'authenticated', 'forged role claim');
reset role;

-- 10. Client roles cannot TRUNCATE, add triggers to, or reference any Wasl table (0005). TRUNCATE ignores RLS, so a
--     table grant is the only barrier. Every public table in this test database is a Wasl table, so a NEW table that
--     0005 forgets is caught here too. Privilege-denied is required (SQLSTATE 42501); any other error, such as a
--     foreign-key refusal, does not count as blocked.
create or replace function pg_temp.expect_denied(stmt text, who text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'NOT DENIED: % ran as %', stmt, who;
end $$;
do $$ declare t text; r text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_pre_counts' order by 1 loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, format('public.%I', t), 'TRUNCATE')
         or has_table_privilege(r, format('public.%I', t), 'TRIGGER')
         or has_table_privilege(r, format('public.%I', t), 'REFERENCES') then
        raise exception 'client role % still holds TRUNCATE/TRIGGER/REFERENCES on public.%', r, t;
      end if;
    end loop;
  end loop;
end $$;
set role anon;
select pg_temp.expect_denied('truncate public.posts', 'anon');
select pg_temp.expect_denied('truncate public.users', 'anon');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select pg_temp.expect_denied('truncate public.posts', 'authenticated');
select pg_temp.expect_denied('truncate public.achievements cascade', 'authenticated');
reset role;

-- 11. Idempotency is checked by the runner (it applies every migration twice).
select 'ALL ASSERTIONS PASSED' as result;
