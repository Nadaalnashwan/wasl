"""Evaluate alert rules once (for cron / a scheduled job when the in-process scheduler is disabled).

Usage (from backend/):  python -m scripts.run_alerts
"""
from __future__ import annotations

import asyncio
import json

from app.db import SessionLocal, init_db
from app.monitoring.alerts import run_cycle


def main() -> int:
    init_db()
    db = SessionLocal()
    try:
        print(json.dumps(asyncio.run(run_cycle(db)), indent=2))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
