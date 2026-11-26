# Supabase: v2 compatibility review and migration runbook

**Status (2026-11-24): migrations `0003` and `0004` are written and tested locally. They have NOT been applied to
the production project.** Applying them needs the owner's explicit approval (see §6).

## 1. What could and could not be inspected

The connected Supabase project is `wasl project` (ref `wgqppuadvbkfzobwmhoa`, region `ap-southeast-1`,
Postgres 17). Its status was `INACTIVE` (paused). With the owner's permission a restore was attempted through
the Supabase integration; Supabase refused it because an organization member already has two active free
projects (free-plan limit). Consequently **no live schema, migration history, policy, grant, storage or advisor
data could be read from the real project.** Everything below was verified against a database built from the
repository's own migrations on a local PostgreSQL 17 that mimics Supabase's roles and default grants.

To finish the live review, free a project slot (pause/delete another project in that organization or upgrade),
restore `wasl project`, and run the pre-migration checks in §4 — they are read-only.

## 2. Findings from the local reproduction

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | `0003` (as first written) let an authenticated client promote itself: the trigger was `SECURITY DEFINER` and checked `current_user`, which inside such a function is the owner (`postgres`), so it never fired; and `REVOKE UPDATE (role)` has no effect while Supabase's default table-level `GRANT ALL` exists. Proven by `supabase/tests/20_assert_v2.sql` before the fix. Never applied anywhere. | Critical | Table-level `INSERT/UPDATE/DELETE` revoked from `anon`/`authenticated`; `UPDATE` re-granted only on profile columns; trigger is `SECURITY INVOKER`, checks the connection role (never JWT claims), and also protects `id`, `email`, `password_hash`. |
| 2 | `posts.images` is used by the backend since v1 but exists in no Supabase migration: every posts query fails on a database built from the files. Production may have it if it was added by hand — check in §4. | High | `alter table posts add column if not exists images json not null default '[]'` in `0003`; also in the SQLite/Postgres startup migrator. |
| 3 | `job_listings`, `job_search_cache`, `job_api_calls` kept default client grants (RLS with no policy returned 0 rows, but a future policy mistake would expose them). | Low | Grants revoked in `0003`. |
| 4 | Ten foreign keys without an index (`posts.achievement_id`, `cv_versions.user_id`, `cv_suggestions.*`, `job_analyses.user_id`, `oauth_states.user_id`, `uploads.user_id`, `user_job_feed.listing_id`, `saved_jobs.listing_id`). | Performance | `0004`. |
| 5 | Every owner policy calls `auth.uid()` per row (Supabase lint `auth_rls_initplan`). | Performance | `0004` re-creates the same policies with `(select auth.uid())` — identical predicate. |
| 6 | Alert scheduler had no cross-worker coordination. | Medium | `scheduler_leases` table + unique partial index (one open incident per key) in `0003`. |
| 7 | `pgcrypto` is created in `public` by `0001` on a plain Postgres; on Supabase it already lives in `extensions`, so the statement is a no-op there. | Info | None. |

Storage: `0001` creates the private `wasl-uploads` bucket with a per-user-folder **read** policy only; uploads
and deletes go through the backend with the service-role key. Secrets tables (`integrations`, `user_api_keys`,
`oauth_states`) and all monitoring tables have RLS with no client policy and, after `0003`, no client grants.

## 3. What the migrations change

* **0003_v2_security.sql** — additive only: `users.role` (default `'user'`, check constraint, index); grants and
  triggers above; AI traceability columns on `ai_events`; model/kind/verifier/git columns on `eval_runs`;
  `posts.images`; new backend-only tables `admin_audit_log`, `alert_incidents`, `scheduler_leases`; client
  grants revoked on monitoring, secrets and shared job tables. No table or column is dropped; no row is updated
  except that the new `role` column is filled with its default `'user'` for every existing user.
* **0004_v2_performance.sql** — `create index if not exists` × 10; owner policies dropped and re-created with the
  same predicate. The swap is a single `DO` block, so it is atomic without an explicit `BEGIN`/`COMMIT` (see §6b).
* **0005_v2_client_privileges.sql** — revokes `TRUNCATE`, `TRIGGER` and `REFERENCES` from `anon` and
  `authenticated` on the 26 Wasl tables, listed by name. Supabase grants these by default, and `TRUNCATE` ignores
  RLS. Nothing in Wasl uses them: the frontend uses Supabase only for Auth, and the backend connects as a privileged
  role. Other applications' tables are deliberately not listed. Permissions only; no row, column, policy or trigger
  changes.

All three are idempotent (the test applies each twice) and are applied in the order 0003 → 0004 → 0005.

## 4. Pre-migration checks (read-only, run in the SQL editor)

```sql
-- applied migrations / manual drift
select * from supabase_migrations.schema_migrations order by version;          -- if the CLI was used
select column_name from information_schema.columns
 where table_schema='public' and table_name='posts' and column_name='images';  -- finding 2
select column_name from information_schema.columns
 where table_schema='public' and table_name='users' and column_name='role';    -- 0003 already applied?
-- existing grants on users (expect the Supabase default: anon/authenticated have UPDATE)
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name='users' order by 1,2;
-- policies and RLS state
select tablename, policyname, cmd, qual from pg_policies where schemaname='public' order by 1;
select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1;
-- sizes (to estimate lock time for the new indexes)
select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by n_live_tup desc;
```

Run **Advisors → Security and Performance** and save the output with the migration ticket.

## 5. Backup and rollback

* **Backup:** Free-plan projects have daily backups but no point-in-time recovery. Immediately before applying,
  take a logical dump of schema + data from a trusted machine:
  `pg_dump "$SESSION_POOLER_URL" --schema=public --format=custom --file=wasl-pre-v2-$(date +%F).dump`
  and verify it with `pg_restore --list`. Store it outside the repository.
* **Rollback (schema):** both migrations are additive, so rolling back the *application* is enough — the v1
  backend ignores the new columns and tables. If the schema itself must be reverted:

```sql
begin;
drop trigger if exists trg_wasl_protect_role on public.users;
drop trigger if exists trg_wasl_default_role on public.users;
drop function if exists public.wasl_protect_role(), public.wasl_default_role(), public.wasl_is_client_role();
grant insert, update, delete on public.users to authenticated;           -- restores the previous default grants
grant all on public.job_listings, public.job_search_cache, public.job_api_calls to anon, authenticated;
-- new tables/columns can stay (harmless) or be dropped once the v1 app is confirmed healthy:
-- drop table public.scheduler_leases, public.alert_incidents, public.admin_audit_log;
commit;
```
  `0004` needs no rollback (same policies, extra indexes).
* **Rollback (data):** none needed — no existing row is modified apart from the defaulted `role` column.

## 6. Deployment order (requires the owner's approval)

1. Pre-checks (§4) + backup (§5). On 2026-11-26 the owner stated that all existing Wasl data on the project is
   dummy data and waived the manual backup; 0003–0005 delete nothing in any case (§6a).
2. Mark `0001` and `0002` as applied (§6b), then apply `0003`, `0004`, `0005` in that order with `supabase db push`.
3. Post-checks: re-run §4; `select role, count(*) from public.users group by 1` (all `user`); Advisors again.
4. Deploy the v2 backend (it also runs the additive startup migrator — a no-op after step 2), then the frontend.
5. Grant the owner's account admin (below), configure `ALERT_SLACK_WEBHOOK_URL`, open `/admin/monitoring`.

Expected impact: a short `ACCESS EXCLUSIVE` lock per `ALTER TABLE … ADD COLUMN` with a constant default (no
table rewrite on Postgres ≥ 11) and per `CREATE INDEX` (tables are small); clients cannot edit `users.email`
or `role` any more — the frontend never did; profile edits go through the backend.

### 6a. Live project state (read-only inspection, 2026-11-26)

* Project `wasl project` (`wgqppuadvbkfzobwmhoa`) is `ACTIVE_HEALTHY`, Postgres 17.11, free plan.
* `supabase_migrations.schema_migrations` lists **no** migrations: `0001` and `0002` were applied by hand. Their
  schema is present: no column is missing and no type differs from a database built from `0001` + `0002`.
* Manual drift: `posts.images` already exists as `jsonb` (0003 adds it as `json` only `if not exists`, so the step
  does nothing).
* The project also hosts **another application**: tables `profiles`, `resumes`, `resume_versions`,
  `job_applications` and `workflow_logs`, buckets `resumes` and `resume-files` with their storage policy, the
  `handle_new_user` trigger on `auth.users` and `set_updated_at`. 0003–0005 do not reference any of them. A local
  replica of these objects was fingerprinted before and after applying 0003 → 0004 → 0005 twice: identical.
* None of the 25 objects 0003/0004 create exists yet (no name collisions).
* Destructive statements: none. The only `drop … if exists` statements target Wasl's own two new triggers (absent)
  and Wasl's 13 policies, which are re-created in the same statement.

### 6b. Migration history and transaction handling

**History.** `supabase db push` compares the local `supabase/migrations` files with
`supabase_migrations.schema_migrations` and runs the ones it does not find. With an empty history it would try to
run `0001` and `0002` again. They must first be recorded as applied **without running them**, with
`supabase migration repair --status applied`, which inserts history rows only. Run this from a trusted machine with
Supabase CLI **3.4.0** and the database password, never from CI. In CLI 3.4.0, `--remote` with no value targets the
linked project; without `--remote` the commands target the local stack. `--db-url` is deprecated; use
`--remote=<url>` instead.

```bash
supabase --version                                             # 3.4.0 (the version verified below)
supabase link --project-ref wgqppuadvbkfzobwmhoa
supabase migration list --remote                               # expect local 0001..0005, remote empty
supabase migration repair --status applied 0001 0002 --remote  # records history only; runs no SQL from the files
supabase migration list --remote                               # expect remote 0001, 0002
supabase db push --dry-run --remote                            # must list exactly 0003, 0004, 0005
supabase db push --remote                                      # owner approval required
supabase migration list --remote                               # expect remote 0001..0005
```

Stop at the first deviation: if `migration list` does not show all five local files, or if the dry run lists anything
other than 0003, 0004 and 0005.

**Verified on 2026-11-26 with CLI 3.4.0 against a disposable local PostgreSQL 16, never the live project.** The
database had 0001/0002 applied by hand, no `supabase_migrations` schema, `posts.images` as `jsonb`, and a replica of
the other application's tables, policies, triggers and buckets. Commands were run with `--remote=<disposable url>`.

1. `migration list` showed local `0001`–`0005` and an empty remote: 4-digit versions are accepted.
2. `migration repair --status applied 0001 0002` printed `Repaired migration history: [0001 0002] => applied`.
   - It created `supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`
     and inserted `0001|init` and `0002|jobs`.
   - With server statement logging on, the only SQL it sent was that schema/table setup and two
     `INSERT INTO supabase_migrations.schema_migrations`. The file contents appear only as `INSERT` parameter data;
     **no SQL from 0001/0002 ran**.
3. `migration list` then showed remote `0001`, `0002`.
4. `db push --dry-run` printed `Would push these migrations: 0003_v2_security.sql, 0004_v2_performance.sql,
   0005_v2_client_privileges.sql` and changed nothing.
   - On an identical database **without** the repair, the dry run listed all five, `0001` and `0002` included, so
     the repair is required.
5. `db push` applied the three files without warnings.
   - History became `0001`–`0005`.
   - Every object of the other application, and every row count, was unchanged; the only additions were the three
     new empty Wasl tables.
   - `supabase/tests/20_assert_v2.sql` passed, and a second `db push` reported `Remote database is up to date`.
6. A deliberately failing scratch migration (never in the repository) made `db push` stop with `DbPushApplyError`,
   and neither its table nor its history row was kept. The CLI runs each file, with its history insert, atomically,
   which is why 0004 must not contain its own `COMMIT` (below).

Not verified offline: `--remote` against the real linked project (login, TLS, connection pooler). The first live
`migration list --remote` is the check for that.

Do **not** apply these files through a tool that assigns its own version numbers (for example the dashboard or MCP
"apply migration", which use a new timestamp). Their history rows would not match `0003`–`0005`, and a later
`db push` would run them again.

**Transactions.** 0004 used to contain an explicit `BEGIN; … COMMIT;`. When a runner wraps a file in its own
transaction, which was reproduced with `psql --single-transaction`, the inner `BEGIN` only warns and the inner
`COMMIT` ends the runner's transaction early. A later error could then no longer roll the file back, and anything
the runner does afterwards, such as its history insert, runs outside it. On 2026-11-26 the policy swap was
rewritten as one `DO` block. It is atomic on its own and leaves transaction control to the runner. The resulting
policies and indexes are byte-identical to the previous version (compared on two local databases), and a wrapped
run with a forced late failure now rolls back completely. 0003 and 0005 contain no transaction statements.

### Granting your own account admin (after step 2)

```bash
cd backend
# DATABASE_URL = the Session-pooler connection string (server-side only)
python -m scripts.admin grant <your-email> --user-id <your auth user id> --reason "owner"
python -m scripts.admin list
```

The `--user-id` is in Supabase → Authentication → Users. On Supabase the script refuses unless the id exists in
`auth.users`, the email matches, and the email is confirmed. It never creates an account or password.

## 7. How the local verification was run

```bash
PGURL=postgresql://postgres@localhost:54329 supabase/tests/run_local.sh      # throwaway local Postgres only
cd backend && PYTHONPATH=. DATABASE_URL=sqlite:///:memory: \
  python ../supabase/tests/schema_drift.py postgresql+psycopg://postgres@localhost:54329/wasl_migration_test
WASL_TEST_DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/wasl_pytest pytest -q
```

Results (2026-11-24): synthetic pre-v2 rows (users, CVs, versions, achievements, posts, encrypted integration
and API-key rows, monitoring rows, saved jobs) all preserved with identical values; 12/12 escalation and RLS
assertions blocked; both migrations idempotent; model ↔ migration drift: none; full backend suite (128 tests)
passed on the migrated PostgreSQL schema. The same three steps run in CI (`supabase-migrations` job).
