# QA report — WASL V2 (v2.1 "Ivory" iteration)

Date: 2026-11-24 · Branch `feature/wasl-v2` · macOS, Python 3.12 (uv venv), Node 24, Google Chrome (system),
PostgreSQL 17 (local, throwaway). Local QA database (`AUTH_MODE=local`), **no AI provider keys** and **no OAuth
client credentials** in this environment. Every result below was produced by a command run in this session.

## Automated checks

| Check | Command | Result |
|---|---|---|
| Backend lint | `ruff check app scripts tests` | pass |
| Backend tests (SQLite) | `pytest -q` | **128 passed** (115 at the previous report, 32 at the start of v2) |
| Backend tests (PostgreSQL built from `supabase/migrations`) | `WASL_TEST_DATABASE_URL=… pytest -q` | **128 passed** |
| Supabase migrations on a Supabase-like Postgres | `supabase/tests/run_local.sh` | 0001→0004 applied twice (idempotent); synthetic pre-v2 data preserved; 12/12 escalation & RLS assertions blocked |
| Model ↔ migration drift | `supabase/tests/schema_drift.py` | none (found and fixed `posts.images`, `scheduler_leases`) |
| Supabase token verification | `pytest tests/test_supabase_auth.py` | 9 passed (ES256 + HS256, expiry, audience, issuer, `alg=none`, tampering, metadata roles, email collision, isolation) |
| Security regression | `pytest tests/test_security.py` | 76 passed |
| Required contradictions | `pytest tests/test_units.py -k required_contradictions` | 10/10 blocked |
| Deterministic eval — dev set | `python -m app.eval_v2` | 205/205 (development set; see `docs/EVALUATION.md`) |
| Deterministic eval — held-out 1 | `--dataset heldout` | first run **63/79**; after fixes 79/79 (no longer independent) |
| Deterministic eval — held-out 2 | `--dataset heldout2` | **21/28** (independent, not tuned) |
| Frontend lint / types / build | `npm run lint` · `npx tsc --noEmit` · `npm run build` | pass · pass · pass (Next.js 16.4.6) |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Live AI evaluation / benchmark | `python -m app.evaluation` | **not run** — no provider keys |
| GitHub Actions CI | `.github/workflows/ci.yml` | run [45444530875](https://github.com/Nadaalnashwan/wasl/actions/runs/45444530875) on `220f062`: backend, frontend and supabase-migrations jobs all **success** |

Correction to the previous report: the commit it described (`57008ca`) **failed** backend lint in CI (a duplicate
`import pytest` in `tests/test_security.py`); the local "pass" was recorded before that line was added. It was
fixed in `95f2cc5`, and a YAML quoting error introduced in `23c42c1` was fixed in `220f062`.

## Browser, responsive and accessibility (production build, `scripts/qa-visual.mjs`)

Matrix: 12 routes (landing, login, register, dashboard, achievements, Master CV, Content Studio, jobs, tailoring,
skill gaps, settings, admin monitoring) × 6 widths (1440, 1280, 1024, 768, 390, 320) × light/dark × English/Arabic
= **288 page checks**, signed in with the local seed account (which holds the admin role on the QA database).

| Check | Before (v2.0, 390 px subset, 48 checks) | After (v2.1, full matrix, 288 checks) |
|---|---|---|
| Horizontal overflow > 1 px | 0 | **0** |
| axe-core violations (WCAG 2.0/2.1/2.2 A + AA rule sets) | color-contrast on 19 page variants; invalid `<dl>` on 8 | **0** |
| Elements with a pure-white (`#FFFFFF`) computed background (light mode) | 24 page variants | **0** |
| Console errors | 0 | **0** |
| Unexpected redirects | 0 | **0** |

Fixed during this pass: muted text contrast on tinted surfaces (new tokens), `dt`/`dd` nested in wrapper
`div`s (landing, achievements), a keyboard-unreachable scrollable CV preview (now a labelled focusable region).

Admin isolation, checked in the same run with a freshly registered **normal** user: the gate endpoint returned
403, `/admin/monitoring` redirected to `/admin-gate`, `/api/admin/monitoring/metrics` 403, legacy
`/api/monitoring/metrics?scope=all` 403, anonymous `/api/admin/health` 401.

Screenshots: `docs/screenshots/v2-ivory/` (after; includes 390 px Arabic RTL, dark, 768 px) and
`docs/screenshots/before/` (v2.0). Full per-check output: `qa-report.json` in each folder.

**Not covered by automation:** screen-reader testing, manual keyboard walk-through of every dialog, reflow at
400 % zoom, and non-text contrast of focus rings in every state. Automated axe checks catch only part of WCAG
2.2 AA; this is **not** a compliance claim.

## Monitoring and alerting

Real processes against a throwaway database and a local mock webhook (details in `docs/MONITORING.md`): rule
fired with the correct value (0.4 = 12/30); with two workers started together exactly one evaluated and no
duplicate notification was sent; recovery delivered. Normal users never receive monitoring data (above). Slack
delivery to a real workspace: **not verified** (no webhook provided).

## Integrations

| Integration | Status in this environment | What was verified |
|---|---|---|
| GitHub OAuth / repository scan | Not configured (`GITHUB_CLIENT_ID/SECRET` absent) — Settings shows "Not available on this server" | Code review of the OAuth flow (user-bound one-time state, 10-minute expiry, provider check, tokens encrypted and never sent to the browser); ownership-scoped repo snapshots; unit tests of extraction and contribution confirmation |
| LinkedIn OAuth / publishing | Not configured (`LINKEDIN_CLIENT_ID/SECRET` absent) | Publish flow with a **mocked** LinkedIn client (`test_flagged_claims_need_specific_user_assertions_not_a_generic_checkbox`); nothing was published |
| Supabase Auth (live) | Project paused; restore refused by the free-plan project limit | Token verification with real signatures (tests); migrations on a Supabase-like local Postgres |

## Not verified

* Live LLM quality, latency, tokens and cost; provider comparison (no keys).
* Real Supabase sign-up, email confirmation, refresh and logout against the project; live schema, advisors,
  storage policies and migration history (project paused — see `docs/SUPABASE_MIGRATION.md`).
* GitHub and LinkedIn OAuth against real accounts.
* Slack delivery to a real channel.
