"""Fail if the backend's SQLAlchemy models need a table/column that supabase/migrations does not create.

    cd backend && PYTHONPATH=. DATABASE_URL=sqlite:///:memory: python ../supabase/tests/schema_drift.py \
        postgresql+psycopg://postgres@localhost:54329/wasl_migration_test
"""
import sys
from sqlalchemy import create_engine, inspect
from app.models import Base
mig = inspect(create_engine(sys.argv[1]))
missing, typed = [], []
for t in Base.metadata.sorted_tables:
    if not mig.has_table(t.name):
        missing.append(f"TABLE {t.name}"); continue
    cols = {c['name']: c for c in mig.get_columns(t.name)}
    for c in t.columns:
        if c.name not in cols:
            missing.append(f"{t.name}.{c.name} ({c.type}, nullable={c.nullable})")
        else:
            mc = cols[c.name]
            if not c.nullable and mc['nullable'] and not c.primary_key:
                typed.append(f"{t.name}.{c.name}: model NOT NULL, db nullable")
            if c.nullable is False and mc['nullable'] is False: pass
print("MISSING:", *missing, sep="\n  ")
print("NULLABILITY:", *typed, sep="\n  ")
extra=[]
for name in mig.get_table_names():
    if name not in Base.metadata.tables and not name.startswith('_'): extra.append(name)
print("DB-only tables:", extra)
sys.exit(1 if missing or typed else 0)
