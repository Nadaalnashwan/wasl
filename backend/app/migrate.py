"""Additive, idempotent schema upgrades for existing databases.

`Base.metadata.create_all` creates missing TABLES but never adds COLUMNS to tables that already exist,
so upgrading a v1 database needs explicit ALTERs. Every step here is additive (ADD COLUMN with a default)
and safe to run repeatedly; nothing is dropped or rewritten. The same changes for Supabase live in
supabase/migrations/0003_v2_security.sql (which also adds the role-protection trigger and RLS hardening).
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

log = logging.getLogger("wasl.migrate")

# (table, column, portable DDL type + default)
ADDITIVE_COLUMNS: list[tuple[str, str, str]] = [
    ("users", "role", "VARCHAR(16) NOT NULL DEFAULT 'user'"),
    ("ai_events", "returned_model", "VARCHAR(120) NOT NULL DEFAULT ''"),
    ("ai_events", "registry_version", "VARCHAR(40) NOT NULL DEFAULT ''"),
    ("ai_events", "est_cost_usd", "FLOAT"),
    ("ai_events", "pricing_version", "VARCHAR(40) NOT NULL DEFAULT ''"),
    ("ai_events", "privacy_level", "VARCHAR(20) NOT NULL DEFAULT ''"),
    ("ai_events", "redactions", "INTEGER NOT NULL DEFAULT 0"),
    ("eval_runs", "model", "VARCHAR(200) NOT NULL DEFAULT ''"),
    ("eval_runs", "kind", "VARCHAR(20) NOT NULL DEFAULT 'live'"),
    ("eval_runs", "verifier_version", "VARCHAR(40) NOT NULL DEFAULT ''"),
    ("eval_runs", "git_sha", "VARCHAR(40) NOT NULL DEFAULT ''"),
]


def upgrade(engine: Engine) -> list[str]:
    """Add any missing v2 columns. Returns the list of applied changes (for logs/tests)."""
    applied: list[str] = []
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in ADDITIVE_COLUMNS:
            if table not in tables:
                continue  # create_all will create it with the column
            existing = {c["name"] for c in insp.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {ddl}'))  # noqa: S608 - static identifiers
            applied.append(f"{table}.{column}")
    if applied:
        log.info("schema upgraded: %s", ", ".join(applied))
    return applied
