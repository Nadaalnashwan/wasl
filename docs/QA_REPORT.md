# QA report — WASL V2

Date: 2026-11-24 · Branch `feature/wasl-v2` · Environment: macOS, Python 3.12 (uv venv), Node 24, local SQLite QA
database, `AUTH_MODE=local`, **no AI provider keys** (AI features show their honest "AI unavailable" state).

## Automated checks

| Check | Command | Result |
|---|---|---|
| Backend lint | `ruff check app scripts tests` | pass |
| Backend tests | `pytest -q` | **115 passed** (32 at the start of v2) |
| Security regression | `pytest -q tests/test_security.py` | 72 passed (authorization matrix 15 routes × anon/user/admin, forged role, self-promotion, revocation, IDOR, outbound PII payloads, privacy policy, migration, alerts) |
| Required contradictions | `pytest tests/test_units.py -k required_contradictions` | 10/10 blocked with the expected reason code |
| Deterministic AI evaluation | `python -m app.eval_v2` | 193/205 cases; precision 1.00, recall 0.98 on claim detection (dev-set; see `docs/EVALUATION.md`) |
| Frontend lint | `npm run lint` | pass |
| Frontend type check | `npx tsc --noEmit` | pass |
| Frontend production build | `npm run build` | pass (Next.js 16.4.6) |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities (after upgrading Next.js from 16.4.2) |
| Secrets scan | git grep + full history scan | no real secrets; placeholders only |
| Live AI evaluation | `python -m app.evaluation` | **not run** — no provider keys (refuses to produce numbers) |

## Browser checks (built-in browser, local dev servers)

| Area | Viewports / modes | Result |
|---|---|---|
| Landing, login | 1440 desktop | Renders; hero, workflow, evidence and privacy sections; no console errors |
| Overview, Achievements, Master CV, Content Studio, Jobs, Tailor, Skill gaps, Settings | 1440 desktop, light | All render with real (seeded) data or honest empty states; no monitoring entry in the user navigation; no console errors |
| All ten user routes | 390 × 844, **Arabic RTL**, **dark** | `dir=rtl`, dark theme applied; scripted check: **0 px horizontal overflow** on every route (Settings' section nav scrolls horizontally by design) |
| `/admin/monitoring` as a normal user | desktop | Server redirect to `/admin-gate` → "Administrator access required"; admin API 403, legacy `/api/monitoring/metrics?scope=all` 403, anonymous 401 |
| `/admin/monitoring` as an admin (granted with `scripts.admin`) | desktop | Gate issues the HttpOnly cookie, console loads; Overview, Providers & models, Alerts, AI quality, Evaluation verified; empty metrics shown as N/A; deterministic run labelled "No live AI provider" |

Sign-in used the project's own local seed account (`scripts/seed_demo.py`) on a throwaway QA database.

## Not verified

* Real LLM output quality, latency and cost (no keys); provider benchmark.
* Slack/webhook delivery against a real endpoint (delivery logic tested with a mocked transport).
* Supabase mode end to end (migration 0003 written and reviewed, not applied to a live project).
* LinkedIn/GitHub OAuth against real accounts (no client credentials; publishing was **not** exercised).
* 320 px and 768 px widths were not individually screenshotted (390 px and 1440 px were).
* Screen-reader testing; no automated axe scan was run. Keyboard focus styles, labels, dialog focus (Radix) and
  reduced-motion support are implemented but not audited against WCAG 2.2 AA.
