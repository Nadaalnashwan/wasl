#!/usr/bin/env bash
# Test Wasl's Supabase migrations on a throwaway local PostgreSQL with Supabase-like roles and grants.
#   PGURL=postgresql://postgres@localhost:54329 supabase/tests/run_local.sh
# Creates (and drops) a database named wasl_migration_test. Never point PGURL at a real project.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PGURL:?set PGURL to a local throwaway PostgreSQL server}"
case "$PGURL" in *supabase.co*|*supabase.com*|*pooler*) echo "refusing to run against a hosted database"; exit 2;; esac
DB=wasl_migration_test
psql "$PGURL/postgres" -qX -c "drop database if exists $DB" -c "create database $DB"
P=(psql "$PGURL/$DB" -qX -v ON_ERROR_STOP=1)
"${P[@]}" -f tests/00_supabase_stub.sql
"${P[@]}" -f migrations/0001_init.sql
"${P[@]}" -f migrations/0002_jobs.sql
"${P[@]}" -f tests/10_seed_pre_v2.sql
for m in migrations/0003_*.sql migrations/0004_*.sql migrations/0005_*.sql; do
  [ -f "$m" ] || continue
  echo "applying $m (twice, to check idempotency)"
  "${P[@]}" -f "$m"; "${P[@]}" -f "$m"
done
"${P[@]}" -f tests/20_assert_v2.sql
