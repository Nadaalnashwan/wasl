"""Evaluate alert rules once (for cron / a scheduled job when the in-process scheduler is disabled).

Usage (from backend/):  python -m scripts.run_alerts

Shares the database lease with the in-process scheduler, so cron + several workers never double-notify.
"""
from __future__ import annotations

import asyncio
import json

from app.db import SessionLocal, init_db
from app.monitoring.alerts import run_scheduled_cycle


def main() -> int:
    init_db()
    db = SessionLocal()
    try:
        result = asyncio.run(run_scheduled_cycle(db))
        print(json.dumps(result if result is not None else {"skipped": "another worker holds the alert lease"}, indent=2))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
