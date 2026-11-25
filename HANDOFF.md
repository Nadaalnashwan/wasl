# WASL V2 — Technical handoff

**Branch:** `handoff/wasl-v2-ivory`, cut from `feature/wasl-v2` at `47efe63`. `feature/wasl-v2` and its draft
PR ([Nadaalnashwan/wasl#1](https://github.com/Nadaalnashwan/wasl/pull/1)) are unchanged.
**Base:** `main` at `1704ae8` (v1). Nothing has been merged into `main`.
**Date:** 2026-11-26.

This document is self-contained. A developer or coding agent should be able to continue from here without the
conversation history. Each claim in it is backed by a command that was run, a test in the repository, or a
document listed in [§9](#9-reference-map). Anything not verified is labelled as such.

---

## Contents

1. [Project overview](#1-project-overview)
2. [Completed work](#2-completed-work)
3. [Remaining tasks](#3-remaining-tasks)
4. [Environment configuration](#4-environment-configuration)
5. [Setup instructions](#5-setup-instructions)
6. [Evaluation and QA results](#6-evaluation-and-qa-results)
7. [Deployment runbook](#7-deployment-runbook)
8. [Continuation checklist](#8-continuation-checklist)
9. [Reference map](#9-reference-map)

---

## 1. Project overview

### Purpose and scope

Wasl (وصل) is a bilingual (English/Arabic) career workspace. A user documents an achievement once, and Wasl
reuses it in four places:

- LinkedIn posts (Content Studio);
- a versioned Master CV;
- CVs tailored to a job description;
- a skill-gap roadmap.

AI output is checked against the user's own evidence by a deterministic claim verifier. Contact details and
identifiers are redacted before text reaches an AI provider. The Master CV changes only when the user approves.
Operational monitoring, evaluation and alerting live in a separate admin-only console at `/admin`.

**In scope and implemented:**

- authentication (local JWT or Supabase Auth);
- achievements, with discovery from text, documents and GitHub;
- Content Studio, with LinkedIn publishing behind per-claim confirmation;
- Master CV with upload, parsing, versions, suggestions, and PDF/DOCX export;
- CV tailoring and gap analysis;
- job matches (JSearch and SerpApi, optional);
- user settings with bring-your-own provider keys;
- the admin console (monitoring, alerts, audit log).

### Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.4.6 (App Router, `src/proxy.ts`), React 19.3, TypeScript, Tailwind CSS 4 (`@theme inline`), Radix primitives, Recharts, lucide-react, `@supabase/supabase-js` |
| Fonts | Inter (UI), IBM Plex Sans Arabic (Arabic), Newsreader (display headings) |
| Backend | FastAPI, Pydantic 2, SQLAlchemy 2, LangGraph workflows, own httpx provider adapters, PyJWT, `cryptography` (Fernet), pypdf, python-docx, fpdf2 |
| AI providers | Groq, Google Gemini, OpenRouter (platform keys or user BYOK); a deterministic fake provider for tests only |
| Database | SQLite locally (zero setup); Supabase PostgreSQL 17 + RLS in production |
| Auth / storage | Supabase Auth (JWKS ES256/RS256 or legacy HS256) and private Supabase Storage bucket `wasl-uploads` |
| Hosting (per README) | Vercel (frontend, root `frontend/`), Render (backend, root `backend/`) — current production URLs not verified in this session, see task [R-14](#r-14-production-deployment) |
| CI | GitHub Actions: `.github/workflows/ci.yml` (every push and PR) and `live-eval.yml` (manual, weekly, release; uses secrets) |
| QA tooling | pytest, ruff, ESLint, `tsc`, `playwright-core` 1.56.1 + `axe-core` 4.11.0 (`frontend/scripts/qa-visual.mjs`) |

Runtimes used here: Python 3.12 (`requires-python >= 3.11`); Node 24 locally and Node 22 in CI.

### Architecture

```text
Browser ── Next.js (Vercel) ───────────────── Supabase Auth (AUTH_MODE=supabase)
             │  lib/api.ts: Bearer token only
             │  src/proxy.ts: server gate for /admin/* (HttpOnly cookie, role re-checked per request)
             ▼
         FastAPI (Render)  backend/app
           ├─ middleware: monitor_requests (route template, status, latency)
           ├─ routers/: auth, achievements, discovery, posts, cv, career, jobs, integrations,
           │            user_settings, dashboard, monitoring (legacy, admin-only), admin (require_admin)
           ├─ ai/: router.py (tiers, retries, fallback, deadline, privacy filter)
           │       model_registry.py, pricing.py, providers/ (groq/openrouter via openai_compat, gemini, fake)
           │       workflows/ content.py, discovery.py, career.py (LangGraph)
           │       claims.py (verifier claims-v2.2), skills.py (lexicon + tool families)
           ├─ security/: auth.py, authz.py, crypto.py, guard.py (prompt injection), pii.py (redaction)
           ├─ monitoring/: recorder.py, metrics.py, alerts.py (scheduler + lease, incidents, Slack/webhook)
           └─ services/: documents, export, cv_updates, github, linkedin, job_sources
             ▼
         SQLite (local) / Supabase Postgres + RLS · local disk / Supabase Storage
```

The backend's direct SQLAlchemy connection bypasses RLS, so **authorization is enforced in Python**:

- `deps.owned()` returns 404 for rows owned by someone else;
- `authz.require_admin` guards every admin route, with the role read from the database on every request.

RLS is defence in depth for the public `anon` and `authenticated` keys. Details are in `docs/ARCHITECTURE.md`
and `docs/SECURITY.md`.

### Repository structure

```text
wasl/
├─ HANDOFF.md                    ← this file
├─ README.md                     product overview + doc index
├─ .github/workflows/            ci.yml (backend, frontend, supabase-migrations jobs), live-eval.yml
├─ backend/
│  ├─ app/                       FastAPI app (see architecture above); migrate.py = additive startup migrator
│  │  ├─ eval_v2.py              deterministic evaluation runner (no LLM)
│  │  └─ evaluation.py           live evaluation / provider benchmark (real LLM calls, budgeted)
│  ├─ eval/
│  │  ├─ v2/*.json               dev set wasl-eval-v2.1 (205 cases, CI-gated)
│  │  ├─ heldout/                wasl-heldout-1.0 (79 cases) + builder
│  │  ├─ heldout2/               wasl-heldout-2.0 (28 cases) + builder
│  │  ├─ dataset.json            v1 live-eval dataset
│  │  ├─ baseline_deterministic.json  CI regression baseline
│  │  └─ results/*.md            committed result reports (*.json is git-ignored)
│  ├─ scripts/                   admin.py (role grant/revoke/list), run_alerts.py (cron), seed_demo.py
│  ├─ tests/                     test_units, test_journeys, test_security, test_supabase_auth, test_jobs
│  ├─ .env.example               every backend variable, documented
│  └─ requirements.txt / requirements-dev.txt / pyproject.toml
├─ frontend/
│  ├─ src/app/                   landing, login, register, (app)/{dashboard,achievements,cv,studio,jobs,tailor,gap,settings},
│  │                             admin/{monitoring,audit}, admin-gate, api/admin-session
│  ├─ src/components/            ui/ primitives, shell/, admin/, studio/, cv/, jobs/, landing/, claims.tsx, feedback.tsx …
│  ├─ src/lib/                   api client, providers (auth/theme/i18n), locales (en/ar), admin-session
│  ├─ src/proxy.ts               /admin gate
│  ├─ scripts/qa-visual.mjs      responsive + axe + pure-white + console QA (local stack only)
│  └─ .env.example
├─ supabase/
│  ├─ migrations/                0001_init, 0002_jobs, 0003_v2_security, 0004_v2_performance
│  └─ tests/                     run_local.sh, 00_supabase_stub.sql, 10_seed_pre_v2.sql, 20_assert_v2.sql, schema_drift.py
└─ docs/                         see §9; screenshots/before (v2.0) and screenshots/v2-ivory (v2.1)
```

### Implementation status

| Area | Status |
|---|---|
| Code for every V2 requirement | Implemented on this branch |
| Automated tests, lint, build, deterministic evaluation | Pass locally and in CI (§6) |
| Supabase migrations `0003`/`0004` | Written and tested on a Supabase-like local Postgres and in CI. **Not applied to production.** |
| Live Supabase project | **Not inspected.** The project is paused and could not be restored because of the free-plan project limit. |
| Live AI evaluation / provider comparison | **Not run.** No provider keys were available. |
| GitHub and LinkedIn OAuth, Slack delivery | **Not tested against real accounts.** No credentials were available. |
| Production deployment of V2 | **Not done.** Requires approval. |

---

## 2. Completed work

Commits on `feature/wasl-v2` since `main` (`git log --oneline 1704ae8..47efe63`) cover all of the following.

### Ivory UI/UX redesign

- Removed the v1 "sketchbook" look: handwritten fonts, irregular borders, offset shadows and illustrations.
- Replaced the cold white palette that followed with a warm, editorial "Ivory" system applied to every page:
  - hairline separators instead of boxes;
  - `List`, `MetricRow` and `PageHeader` with no container;
  - `EmptyState` as a quiet note with a rule on its start side, never a dashed box;
  - one brand blue.
- The dashboard is an editorial introduction with a date label and serif greeting. Landing and auth pages use
  Newsreader display headings.
- **No light-mode surface is `#FFFFFF`.** The QA script fails a page if any element larger than 8×8 px computes
  to pure white.
- Accessibility fixes found by axe:
  - muted-text contrast on tinted surfaces;
  - invalid `<dl>` nesting (landing, achievements);
  - a keyboard-unreachable scrollable CV preview, now a labelled focusable region.
- Files: `frontend/src/app/globals.css`, `frontend/src/components/ui/*`, `components/shell/app-shell.tsx`,
  `components/feedback.tsx`, all pages under `src/app`.

### Design system and colour palette

Tokens are defined in `frontend/src/app/globals.css` and documented in `docs/DESIGN_SYSTEM.md`.

| Role | Light | Dark |
|---|---|---|
| Page background `--bg` | `#F5F1E8` | `#14161B` |
| Primary surface `--surface` | `#FAF7F0` | `#1B1E24` |
| Secondary surface `--surface-2` | `#EDE6D8` | `#23272F` |
| Elevated surface `--surface-elevated` | `#FCFAF5` | `#22262D` |
| Subtle accent `--surface-3` | `#E8E0D2` | `#2B3039` |
| Border `--border` | `#D8CFC0` | `#30353F` |
| Text / secondary / muted | `#202B3C` / `#4D5360` / `#646052` | `#ECE7DD` / `#BFB8AA` / `#9C9587` |
| Primary / hover / selection | `#0B57C9` / `#0848A8` / `#E5EBF4` | `#7AA9F7` / `#9BBEF9` / `#1C2A42` |

Also defined:

- `--bg-sidebar`, `--field`, `--paper` (CV preview), `--border-soft`, `--border-strong` (≥ 3:1 for controls);
- status colours (ok, warn, bad);
- `--scrim`;
- warm shadows.

Every text token measures ≥ 4.5:1 on every surface token in both themes.

### Admin monitoring separation

- Monitoring was removed from the user navigation, dashboard and settings.
- A separate console lives at `/admin` (monitoring, audit log), gated server-side by `frontend/src/proxy.ts`.
  The gate re-checks an HttpOnly cookie against the backend on every request, and a revoked admin loses access
  on the next request.
- Every `/api/admin/*` route uses `require_admin`.
- The legacy `/api/monitoring/*` endpoints are admin-only. `scope=all` used to expose global metrics to any user.
- The public `/api/health` returns only `{"status":"ok"}`. Details are at `/api/admin/health`.
- An admin's nav link is a visibility convenience only, not the security boundary.
- Files: `backend/app/routers/admin.py`, `routers/monitoring.py`, `security/authz.py`,
  `frontend/src/app/admin/*`, `src/app/admin-gate`, `src/app/api/admin-session/route.ts`, `src/lib/admin-session.ts`.

### Authentication and authorization

- **Roles.** A database-backed `users.role` (`user` | `admin`) is read on every request and never taken from JWT
  claims, metadata or the client. `PATCH /api/auth/me` forbids extra fields.
- **Admin provisioning.** Only by CLI: `backend/scripts/admin.py grant|revoke|list`, with an audit log entry in
  `admin_audit_log`. On Supabase a grant requires `--user-id`, an existing `auth.users` row, a matching email and
  a confirmed email address. The CLI never creates accounts or passwords.
- **Supabase token verification** (`security/auth.py`):
  - JWKS (ES256/RS256) or legacy HS256;
  - `aud=authenticated` and `iss=<SUPABASE_URL>/auth/v1` enforced;
  - `exp`, `sub` and `aud` required;
  - `alg=none` and tampered tokens rejected (9 tests in `tests/test_supabase_auth.py`).
- **IDOR coverage.** Ownership checks hardened on indirect lookups, with IDOR and authorization-matrix tests in
  `tests/test_security.py`.

### Security and privacy

- **Database role protection.** Migration `0003`:
  - revokes table-level client writes on `users`;
  - re-grants `UPDATE` only on profile columns;
  - adds `SECURITY INVOKER` triggers that reject client changes to `role`, `id`, `email` and `password_hash`, and
    force client inserts to `role='user'`;
  - revokes client grants on monitoring, secrets and shared job tables.

  A critical self-promotion flaw in the first draft of `0003` was proven and fixed before it was applied anywhere
  (`docs/SUPABASE_MIGRATION.md` finding 1).
- **PII redaction** at the provider boundary (`security/pii.py`) covers:
  - emails and phone numbers (Saudi and international, Arabic-Indic digits);
  - Iqama and national IDs;
  - date of birth;
  - IBAN and card numbers;
  - API keys and JWTs;
  - links and referees.
- **Provider privacy policy** (`ai/router.py`, `docs/PRIVACY.md`):
  - personal-data tasks only go to providers meeting `AI_PERSONAL_MIN_PRIVACY`;
  - the Gemini free tier is excluded;
  - `GROQ_ZDR_ENABLED` and `GEMINI_PAID_TIER` are operator attestations and default to false.
- **Prompt-injection guard** (`security/guard.py`):
  - override, role-tag and tool-exfiltration patterns;
  - instructions addressed to the AI;
  - letter-spacing tricks;
  - zero-width and bidi characters stripped;
  - untrusted data wrapped in delimiters, with only the embedded structure redacted.
- **Secrets at rest.** BYOK keys and OAuth tokens are Fernet-encrypted and never returned, apart from the last 4
  characters.
- **Production startup** refuses to run without a real `JWT_SECRET` and an `ENCRYPTION_KEY`.

### Claim verification

`backend/app/ai/claims.py`, verifier `claims-v2.2`, deterministic with no LLM.

**What it extracts from each sentence:**

- numbers with unit classes;
- skills, credentials and places;
- roles and leadership verbs;
- attribution;
- employers and organisations;
- prestige and vague-impact words;
- creation claims.

**Actor detection.** It decides whether an action was done by the user, the team, a named other person or an
unknown actor. It handles passive "by X" and Arabic verb-first order, and checks authorship conflicts.

**Tool families** (`ai/skills.py`: `FAMILIES`, `with_families`) imply in one direction only: Keras implies deep
learning, but deep learning does not imply Keras.

**Statuses:** `supported`, `unsupported`, `contradicted`, `needs_confirmation`, `ambiguous` and `unavailable`.
`unavailable` is never reported as verified.

**Publishing rule** (`routers/posts.py`, `components/studio/publish-dialog.tsx`):

- A generic checkbox no longer approves flagged claims.
- Each assertable claim needs its own user-written factual statement of at least 20 characters and 4 words, and
  not generic.
- These statements are stored as `user_assertions[].basis="user_asserted"`.
- Contradicted claims must be edited.
- The API returns 409 with `contradicted_claims`, `verification_unavailable` or `unverified_claims`.
- "Unsupported escaped" in monitoring excludes user-asserted claims.

### AI model registry and provider routing

**Registry.** `backend/app/ai/model_registry.py` (`REGISTRY_VERSION 2026-11-24.1`) maps each task to:

- a tier (fast or quality);
- a temperature;
- a token limit;
- a sensitivity level (personal or public).

Prices are in `ai/pricing.py` and are estimates only.

**Default models:**

- Groq: `openai/gpt-oss-120b` (quality) and `openai/gpt-oss-20b` (fast);
- Gemini: `gemini-3.8-flash` (quality) and `gemini-3.5-flash-lite` (fast);
- OpenRouter: `meta-llama/llama-3.3-70b-instruct:free`.

The v1 default `gemini-3.5-flash` is not a listed model ID and was replaced.

**Router** (`ai/router.py`):

- JSON mode with Pydantic validation and one repair round-trip;
- a per-attempt timeout and bounded retries that honour `Retry-After`;
- a hard total deadline;
- privacy-eligible fallback;
- user BYOK modes.

**Traceability.** Each attempt writes an `ai_events` row with the requested and returned model, the registry and
pricing versions, tokens, latency, estimated cost and redaction count. No prompt or completion text is stored.
Details are in `docs/AI_MODEL_REGISTRY.md`.

### Evaluation framework

- **Deterministic suite** (`app/eval_v2.py`): fixed adversarial inputs and fixed "model outputs" run through the
  production verification, enforcement and redaction code.
  - The dev set (205 cases) is CI-gated against `eval/baseline_deterministic.json`.
  - Two held-out sets are report-only: held-out 1 (79 cases) and held-out 2 (28 cases). Each was frozen in its
    own commit (`a170c42`, `aafe8d5`) before its first run.
- **Live evaluation and benchmark** (`app/evaluation.py`, `--max-calls`, `--benchmark`): real providers, a
  budget cap, results stored as `kind=live` or `kind=benchmark` with the actual model IDs. **Not run in V2.**
- Methodology and denominators: `docs/EVALUATION.md`.

### Monitoring and alerting

- **Metrics v2** (`monitoring/metrics.py`):
  - logical requests vs attempts;
  - raw vs post-enforcement vs escaped unsupported claims;
  - `null` / N/A when there is no data;
  - cost estimates by task, model and provider.
- **Alerts** (`monitoring/alerts.py`):
  - an in-process scheduler (`ALERT_EVAL_INTERVAL_MINUTES`) or a cron job (`scripts/run_alerts.py`);
  - a DB lease (`scheduler_leases`) so that one worker evaluates per interval;
  - a unique partial index (`ux_alert_incidents_open_key`) for one open incident per rule;
  - cooldown and recovery notifications;
  - Slack or generic webhook delivery;
  - "Send test alert" in the admin console.

Thresholds are justified in `docs/MONITORING.md`.

### Database migrations

- **`0003_v2_security.sql`** (additive):
  - `users.role` with a check constraint and index;
  - the grant changes and triggers described above;
  - AI traceability columns on `ai_events`;
  - eval run metadata;
  - the `posts.images` column, which was missing from all earlier migrations;
  - new tables `admin_audit_log`, `alert_incidents` and `scheduler_leases`;
  - client grants revoked on backend-only tables.
- **`0004_v2_performance.sql`:**
  - 10 foreign-key indexes;
  - owner policies re-created with `(select auth.uid())`. This is the same predicate, written so it is not
    re-evaluated per row.
- Both migrations are idempotent (the test applies each twice) and additive. No table or column is dropped.
- The SQLite and Postgres startup migrator (`app/migrate.py`) applies the same additive columns and index.

### Testing and CI/CD

The `ci.yml` workflow has three jobs:

- **backend:** ruff, then pytest, then `test_security.py` explicitly, then the deterministic evaluation against
  the baseline (uploads the report);
- **frontend:** `npm ci`, lint, `next build`, `tsc --noEmit`;
- **supabase-migrations** (a `postgres:17` service):
  - `supabase/tests/run_local.sh`: apply migrations twice, preserve synthetic pre-V2 data, 12 escalation and RLS
    assertions;
  - `schema_drift.py`, comparing the models with the migrated schema;
  - the full pytest suite on the migrated Postgres.

`live-eval.yml` never runs on pull requests. It uses the protected `live-eval` environment and repository
secrets, and is budget-capped.

---

## 3. Remaining tasks

Priorities:

- **Critical:** blocks a safe production release.
- **High:** needed for the V2 claims to be verified in production.
- **Medium:** quality gaps that are known and measured.
- **Low:** polish.

### R-01 Restore the existing Supabase project and resolve the free-project limit

| | |
|---|---|
| Priority | **Critical** |
| Why incomplete | Project `wasl project` (ref `wgqppuadvbkfzobwmhoa`, `ap-southeast-1`, Postgres 17) is **paused**. A restore attempted through the Supabase integration was refused because an organization member already has two active free projects. |
| Files | `docs/SUPABASE_MIGRATION.md` §1 |
| Dependencies | None |
| Credentials | Owner access to the Supabase organization |
| Steps | 1. Supabase dashboard → the organization → Projects. Pause or delete one of the other active free projects, or upgrade the organization's plan. 2. Open `wasl project` → **Restore project**. Wait for status `ACTIVE_HEALTHY`. 3. **Do not create a replacement project and do not reset this one.** Existing auth users and IDs must be kept. |
| Acceptance | The project shows as active. Project → Connect shows a Session pooler connection string. |

### R-02 Inspect the actual production database (read-only)

| | |
|---|---|
| Priority | **Critical** |
| Why incomplete | Depends on R-01. No live schema, migration history, policies, grants, storage or advisor output has been read yet. |
| Files | `docs/SUPABASE_MIGRATION.md` §4 (queries), `supabase/migrations/*`, `supabase/tests/schema_drift.py` |
| Dependencies | R-01 |
| Credentials | Supabase SQL editor access, or the Session-pooler `DATABASE_URL` (server-side only) |
| Steps | 1. Run every query in `docs/SUPABASE_MIGRATION.md` §4 in the SQL editor: migration history, whether `posts.images` exists, whether `users.role` exists, grants on `users`, `pg_policies`, the RLS flag per table, and row counts. 2. Advisors → Security and Performance: save both reports. 3. Optionally, from a trusted machine: `cd backend && PYTHONPATH=. DATABASE_URL=sqlite:///:memory: python ../supabase/tests/schema_drift.py "<session-pooler URL>"`. It is read-only and reports columns missing compared with the models. 4. Record any manual drift, such as columns added by hand. If production differs from `0001`/`0002`, adjust `0003` before R-03 and rerun `supabase/tests/run_local.sh`. |
| Acceptance | A written comparison of production against `0001`+`0002`, with advisor output attached. No surprises remain that would make `0003`/`0004` fail or change existing data. |

### R-03 Apply migrations `0003` and `0004` after backup and approval

| | |
|---|---|
| Priority | **Critical** |
| Why incomplete | Requires the owner's explicit approval and R-02. |
| Files | `supabase/migrations/0003_v2_security.sql`, `0004_v2_performance.sql`, `docs/SUPABASE_MIGRATION.md` §5–6 |
| Dependencies | R-01, R-02, written owner approval |
| Credentials | Supabase owner; Session-pooler URL for `pg_dump` |
| Steps | Follow the [deployment runbook](#7-deployment-runbook) steps 1–4. |
| Acceptance | §4 queries show `users.role` (all rows `user`), the `posts.images` column, the new tables and policies with `(select auth.uid())`. The Security advisor shows no new errors. Row counts equal the pre-migration counts. |

### R-04 Administrator account provisioning

| | |
|---|---|
| Priority | **Critical** (the admin console is unusable without it) |
| Why incomplete | Granting admin to a real production account requires explicit owner authorization. It also depends on R-03 (the `role` column). |
| Files | `backend/scripts/admin.py`, `docs/SECURITY.md` "Provisioning administrators" |
| Dependencies | R-03; the owner's account has registered and confirmed its email |
| Credentials | Server-side `DATABASE_URL`, with `AUTH_MODE=supabase` set in the shell environment |
| Steps | `cd backend && python -m scripts.admin grant <owner-email> --user-id <uuid from Authentication → Users> --reason "owner"`, then `python -m scripts.admin list`. Sign in to the app, open `/admin` and confirm the gate lets you in. Then sign in as a normal account and confirm `/admin` redirects to `/admin-gate`. |
| Acceptance | `scripts.admin list` shows exactly the intended admins. `admin_audit_log` has a `role_grant` row. A normal user gets 403 from `/api/admin/*`. **Never commit admin emails or IDs.** |

### R-05 Live AI evaluation

| | |
|---|---|
| Priority | **High** |
| Why incomplete | No provider keys existed in the environment or in repository secrets. No live numbers exist for V2, and none may be invented. |
| Files | `.github/workflows/live-eval.yml`, `backend/app/evaluation.py`, `backend/eval/dataset.json`, `docs/EVALUATION.md` §2 |
| Dependencies | Keys; for personal-data tasks, a privacy-eligible provider (Groq is eligible by default; Gemini only with `GEMINI_PAID_TIER=true` on a billed project) |
| Credentials | Repository secrets `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`; GitHub environment `live-eval` (add required reviewers) |
| Steps | 1. GitHub → Settings → Secrets and variables → Actions: add the keys as **secrets**. Set `GEMINI_PAID_TIER` or `GROQ_ZDR_ENABLED` as **variables** only after verifying the account configuration and provider terms. 2. Actions → "Live AI evaluation" → Run workflow with `max_calls=60`. 3. Download the `live-eval` artifact and copy the summary into `docs/EVALUATION.md` and `docs/QA_REPORT.md`, labelled `kind=live`, with the model IDs actually returned. If a provider is unavailable, do not keep retrying it. |
| Acceptance | `eval_runs` has a `kind=live` row with non-empty `model`. The docs show the real numbers and the date. No deterministic numbers are mixed into the live table. |

### R-06 AI provider quality and cost comparison

| | |
|---|---|
| Priority | **High** |
| Why incomplete | Same blocker as R-05 |
| Files | `backend/app/evaluation.py` (`--benchmark`), `app/ai/pricing.py`, `docs/AI_MODEL_REGISTRY.md` "Provider comparison" |
| Dependencies | R-05 (at least two providers with keys) |
| Credentials | As R-05 |
| Steps | Run the workflow with `benchmark=true` and `max_calls=90`, or locally run `python -m app.evaluation --benchmark --max-calls 90`. Read `eval/results/benchmark-latest.md`. Before quoting costs, verify that list prices in `pricing.py` still match the providers' pages. Costs are **estimates**, and free-tier keys cost $0. |
| Acceptance | A per-provider table with task success, extraction accuracy, quote verification, raw and final unsupported rates, latency p50/p95, tokens, estimated cost and privacy-blocked counts, plus a written recommendation for `AI_PROVIDER_PRIORITY`. |

### R-07 Remaining seven independent evaluation failures (held-out 2)

| | |
|---|---|
| Priority | **Medium** |
| Why incomplete | They are deliberately left unfixed so that held-out 2 stays an independent estimate. Fixing them turns it into a development set. |
| Files | `backend/eval/heldout2/`, `backend/eval/results/deterministic-heldout2-initial.md`, `app/ai/claims.py`, `app/security/guard.py`, `app/security/pii.py` |
| Dependencies | **First write held-out 3** (R-07a). It should come from someone who has not read the verifier code: frozen in its own commit before its first run, and report-only. |
| Credentials | None |
| The 7 cases | `h2-c09` "shortlisted" claimed as "Won" · `h2-c12` a team's migration claimed as "I migrated" (no creation verb) · `h2-c13` Arabic verb-first attribution to a colleague with the verb (صممت) repeated in the output · `h2-i03` Greek homoglyph in "Ιgnore" · `h2-i04` Arabic score instruction with "أعطِ" · `h2-p01` header name separated from the email by " - " · `h2-p06` Slack webhook URL not recognised as a secret |
| Steps | 1. Freeze held-out 3 (≥ 50 cases, synthetic people only) in a commit and run `python -m app.eval_v2 --dataset <new>` once, recording the result. 2. Then fix the general cause of each failure, not the literal string: a "shortlisted/nominated/finalist ≠ won" rule; first-person-singular claims of team work; Arabic verb repetition in `_verb_actors`; Unicode confusable folding (NFKC plus a homoglyph map) before `guard.scan`; the Arabic imperative "أعطِ" with score nouns; name-delimiter handling in the PII header heuristic; webhook URL patterns (`hooks.slack.com/services/…`, Discord and similar) as secrets. 3. Rerun all suites. The dev set must stay 205/205. |
| Acceptance | Held-out 3 has a frozen first-run result. Held-out 2 is 28/28 and is relabelled "not independent" in `docs/EVALUATION.md`. CI stays green. |

### R-08 PII and secret-detection weaknesses

| | |
|---|---|
| Priority | **Medium** (High before handling real CVs at scale) |
| Why incomplete | Detection is pattern- and heuristic-based. Held-out 2 measured PII recall at 0.667 (two of the six PII cases missed). There is no named-entity recognition for free-text names. |
| Files | `backend/app/security/pii.py`, `backend/app/monitoring/recorder.py` (`scrub`), `tests/test_security.py` |
| Dependencies | Overlaps with R-07 (`h2-p01`, `h2-p06`) |
| Credentials | None |
| Steps | 1. Add a generic secret detector: known prefixes (`sk-`, `ghp_`, `xox[bp]-`, `AIza`, `gsk_`), webhook URLs, and high-entropy tokens over a length threshold. Use it in both `pii.py` and `scrub()`. 2. Make header-name redaction robust to separators (` - `, `|`, `·`). 3. Consider an optional local NER model for names, behind a flag. Measure the false-positive cost on the `must_keep` strings. 4. Add regression cases to the **dev** set, never to a frozen held-out set. |
| Acceptance | New dev cases pass. `pii_preservation` stays 1.0 on every set. Tests show payloads reaching the fake provider contain none of the new patterns. |

### R-09 Slack webhook configuration and real alert delivery

| | |
|---|---|
| Priority | **High** |
| Why incomplete | No webhook was provided. Delivery was verified only against a local mock endpoint (`docs/MONITORING.md` validation table). |
| Files | `backend/app/monitoring/alerts.py`, `scripts/run_alerts.py`, `docs/MONITORING.md`, `docs/SETUP.md` §6 |
| Dependencies | A deployed backend (R-14), or a local run against the real webhook |
| Credentials | A Slack incoming webhook for a private channel, stored **only** in the backend host's secret env as `ALERT_SLACK_WEBHOOK_URL` |
| Steps | 1. Slack → Apps → Incoming Webhooks → add to a private channel. 2. Render → backend service → Environment: `ALERT_SLACK_WEBHOOK_URL=<url>`, then redeploy. 3. In `/admin/monitoring` → Alerts → **Send test alert**. 4. Confirm the message arrives and `alert_incidents.delivery_status` is set. 5. If more than one backend instance runs, keep `ALERT_EVAL_INTERVAL_MINUTES=5`: the lease guarantees a single evaluator. With a cron job instead, set it to 0 and schedule `python -m scripts.run_alerts`. |
| Acceptance | The test alert arrives in Slack once. A real rule firing produces a single notification and a recovery message. The URL appears nowhere in the repository or the frontend. |

### R-10 GitHub OAuth integration testing

| | |
|---|---|
| Priority | **High** |
| Why incomplete | `GITHUB_CLIENT_ID`/`SECRET` are absent here. The flow has been checked by code review and unit tests only. An October note also records that the callback URL had not been set in the GitHub app. |
| Files | `backend/app/routers/integrations.py`, `app/services/github.py`, `app/routers/discovery.py`, `docs/SETUP.md` §5 |
| Dependencies | A deployed backend (or localhost) and the matching callback URL |
| Credentials | A GitHub OAuth App: client ID and secret in backend env |
| Steps | 1. github.com/settings/developers → the OAuth App → set the callback to `<BACKEND_URL>/api/integrations/github/callback`. 2. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `GITHUB_REDIRECT_URI` on the backend. 3. Use a **test GitHub account**: Settings → GitHub → Connect, then list repos, scan one, and confirm that discovered achievements arrive as *pending* and need a contribution note. 4. Check `integrations` has an encrypted token and that the browser never receives it (DevTools → Network). 5. Also check a replayed `state` (reusing the callback URL) and one older than 10 minutes; both must fail. |
| Acceptance | The end-to-end scan works. Tokens are encrypted. Replay and expiry are refused. `GITHUB_SCOPES` stays `read:user` unless private repositories are explicitly needed. |

### R-11 LinkedIn OAuth integration testing

| | |
|---|---|
| Priority | **High** |
| Why incomplete | No credentials. Publishing was tested only with a mocked LinkedIn client. **No real post may be published without the owner's explicit approval.** |
| Files | `backend/app/services/linkedin.py`, `app/routers/posts.py`, `app/routers/integrations.py`, `frontend/src/components/studio/publish-dialog.tsx`, `docs/SETUP.md` §4 |
| Dependencies | A LinkedIn developer app with both "Sign In with LinkedIn using OpenID Connect" and "Share on LinkedIn" |
| Credentials | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and the registered `LINKEDIN_REDIRECT_URI` |
| Steps | 1. Add the redirect `<BACKEND_URL>/api/integrations/linkedin/callback` in the LinkedIn app → Auth. 2. Set the backend env and redeploy. 3. Connect from Settings and confirm the profile name appears. 4. Test the 409 paths **without publishing**: a draft with a contradicted claim, a generic assertion, and verification unavailable. 5. Only with the owner's written approval, publish one test post from a test account. Confirm the draft → publishing → published flow and that a double click does not create two posts. If `LINKEDIN_API_VERSION` is rejected, the service falls back to the UGC API. Record which API was used. |
| Acceptance | Connect, disconnect and reconnect work. Guard paths return the documented 409 codes. With approval, exactly one post is published and recorded. Token expiry prompts a reconnect. |

### R-12 Remaining accessibility checks

| | |
|---|---|
| Priority | **Medium** |
| Why incomplete | Automated axe checks cover only part of WCAG 2.2 AA. **No compliance claim is made.** |
| Files | `frontend/scripts/qa-visual.mjs`, `frontend/src/components/ui/*` (focus styles, overlays), `docs/QA_REPORT.md` |
| Dependencies | A local stack (§5) |
| Credentials | None |
| Steps | 1. Screen readers: VoiceOver (macOS/iOS) and NVDA (Windows) through register → add achievement → generate post → publish dialog → CV accept/reject → tailoring, in English and Arabic. 2. Keyboard only: every dialog, drawer, select, tabs, switch and the admin console. Check focus order, focus trapping and return, and Escape. 3. Reflow at 400 % zoom (320 CSS px) and text spacing (WCAG 1.4.12). 4. Non-text contrast of focus rings and control borders in every state (hover, active, disabled, error) and both themes. 5. Target size ≥ 24×24 (2.5.8). Record the findings in `docs/QA_REPORT.md`. |
| Acceptance | A written manual test log with issues fixed or ticketed. `qa-visual.mjs` still reports 0 axe violations, 0 overflow and 0 pure-white surfaces. |

### R-13 Production URL and configuration consistency

| | |
|---|---|
| Priority | **High** |
| Why incomplete | The README links `https://wasl-ruddy.vercel.app`. Earlier `.env.example` defaults named `wasl-mauve-five.vercel.app` and `wasl-arw8.onrender.com`. Which deployments are current was not verified. |
| Files | `README.md`, `backend/.env.example`, `frontend/.env.example`, Vercel and Render project settings |
| Dependencies | None |
| Credentials | Vercel and Render dashboard access |
| Steps | Confirm the canonical frontend and backend URLs. Set `FRONTEND_URL`, `BACKEND_URL` and `CORS_ORIGINS` (Render) and `NEXT_PUBLIC_API_URL` and `API_URL_INTERNAL` (Vercel) to match. Add the frontend URL in Supabase → Authentication → URL configuration. Update the README link. |
| Acceptance | One documented URL per service, and the README link opens the V2 app after R-14. |

### R-14 Production deployment

| | |
|---|---|
| Priority | **Critical** (final step; requires approval) |
| Why incomplete | Deploying to production is explicitly out of scope without owner approval. It depends on R-01 to R-04 and R-13. |
| Files | [§7](#7-deployment-runbook), `docs/SUPABASE_MIGRATION.md` §6, `docs/SETUP.md` §8 |
| Dependencies | R-01, R-02, R-03, R-13; PR #1 reviewed and merged by the owner |
| Credentials | Vercel, Render and Supabase owner access |
| Steps | [§7](#7-deployment-runbook) |
| Acceptance | The post-deployment checks in §7 all pass. |

### R-15 Confirm rotation of keys from v1

| | |
|---|---|
| Priority | **High** |
| Why incomplete | `docs/PROGRESS.md` (2026-10-20) records that v1 provider and OAuth keys "were shared in a chat transcript" and should be rotated. Whether that happened is not known. No secret values are in the repository (checked again for this handoff). |
| Files | `docs/PROGRESS.md` "Blockers" |
| Dependencies | None |
| Credentials | Provider consoles (Groq, Gemini, GitHub, LinkedIn, Supabase) |
| Steps | Rotate every key that existed in October and update the host environments. |
| Acceptance | The owner confirms rotation, with dates noted in `docs/SECURITY.md`. |

---

## 4. Environment configuration

**Never commit real values.** Local values go in `backend/.env` and `frontend/.env.local` (both git-ignored).
Production values go in the host dashboards. Full annotated lists are in `backend/.env.example` and
`frontend/.env.example`. Defaults live in `backend/app/config.py`.

### Backend (FastAPI): local `backend/.env`; production in the Render service's Environment

| Variable | Service | Required? | Notes |
|---|---|---|---|
| `APP_ENV` | core | prod: yes (`production`) | `production` refuses a dev `JWT_SECRET` or an empty `ENCRYPTION_KEY` |
| `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS` | core | prod: yes | Defaults are `localhost:3000` / `:8000` |
| `DATABASE_URL` | Supabase Postgres | prod: yes | Empty means `backend/wasl.db` (SQLite). Prod: the Session pooler, `postgresql+psycopg://…:5432/postgres` |
| `AUTH_MODE` | auth | yes | `local` (dev/demo) or `supabase` (prod). Must match the frontend |
| `JWT_SECRET` | auth (local mode) | prod: yes | ≥ 32 random chars |
| `JWT_EXPIRE_MINUTES` | auth | optional | 1440 |
| `SUPABASE_URL` | Supabase Auth | supabase mode: yes | Used for JWKS and the `iss` check |
| `SUPABASE_JWT_SECRET` | Supabase Auth | legacy HS256 projects only | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage | supabase mode: yes | **Server only** |
| `SUPABASE_STORAGE_BUCKET` | Supabase Storage | optional | `wasl-uploads` |
| `ENCRYPTION_KEY` | BYOK and OAuth token encryption | prod: yes | Fernet key. Rotating it makes stored tokens and keys unreadable, so plan a re-encryption |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | AI providers | at least one for AI features | Server only. Also GitHub Actions secrets for live-eval |
| `AI_PROVIDER_PRIORITY`, `GROQ_MODEL_FAST/QUALITY`, `GEMINI_MODEL_FAST/QUALITY`, `OPENROUTER_MODEL` | AI router | optional | See `docs/AI_MODEL_REGISTRY.md` |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_RETRIES`, `AI_TOTAL_DEADLINE_SECONDS` | AI router | optional | 45 / 2 / 120 |
| `AI_PERSONAL_MIN_PRIVACY` | privacy | optional | `limited_retention` |
| `GROQ_ZDR_ENABLED`, `GEMINI_PAID_TIER` | privacy attestations | optional, default false | Set to true **only after verifying** the account and the terms |
| `AI_REDACT_PII` | privacy | keep `true` | Never disable in production |
| `AI_ENABLE_FAKE_PROVIDER` | tests | keep `false` | |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `LINKEDIN_SCOPES`, `LINKEDIN_API_VERSION` | LinkedIn | optional | Feature hidden when absent |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`, `GITHUB_SCOPES`, `GITHUB_MAX_REPOS_PER_SCAN` | GitHub | optional | |
| `JSEARCH_API_KEY`, `SERPAPI_API_KEY`, `JOBS_*` | job providers | optional | Monthly caps are kept under the free quotas |
| `MAX_UPLOAD_MB`, `PDF_FONT_PATH`, `PDF_FONT_BOLD_PATH` | uploads/export | optional | |
| `ALERT_SLACK_WEBHOOK_URL` / `ALERT_WEBHOOK_URL` | alert delivery | recommended in prod | Secret: host env only |
| `ALERT_EVAL_INTERVAL_MINUTES` | scheduler | optional | 5; 0 = use cron (`scripts.run_alerts`) |
| `ALERT_*` thresholds, `ALERT_MIN_SAMPLE`, `ALERT_COOLDOWN_MINUTES` | alert rules | optional | Rationale in `docs/MONITORING.md` |

### Frontend (Next.js): local `frontend/.env.local`; production in Vercel → Project → Environment Variables

| Variable | Required? | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Backend URL. Default `http://localhost:8000` |
| `NEXT_PUBLIC_AUTH_MODE` | yes | `local` or `supabase` (same as the backend's `AUTH_MODE`) |
| `NEXT_PUBLIC_SUPABASE_URL` | supabase mode | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase mode | Public by design (RLS protects data); the publishable key is preferred |
| `API_URL_INTERNAL` | optional | **Server-only** backend URL used by the `/admin` gate (`src/lib/admin-session.ts`). Falls back to `NEXT_PUBLIC_API_URL` |
| `NEXT_PUBLIC_APP_ENV` | optional | Label shown in the admin console header |

Never put service-role keys, provider keys, OAuth secrets or `ENCRYPTION_KEY` in a `NEXT_PUBLIC_*` variable.

### GitHub Actions

- **Secrets:** `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` (live evaluation only).
- **Variables:** `GEMINI_PAID_TIER` and `GROQ_ZDR_ENABLED` (optional attestations).
- **Environment:** `live-eval`. Add required reviewers.
- `ci.yml` needs no secrets. Pull requests from forks never see secrets.

### Supabase dashboard

- Authentication → URL configuration: the Site URL and redirect URLs must be the production frontend URL.
- The storage bucket `wasl-uploads` (private) is created by `0001`.

---

## 5. Setup instructions

All commands are for macOS/Linux. On Windows, use `.venv\Scripts\Activate.ps1`.

### Clone and check out

```bash
git clone https://github.com/Nadaalnashwan/wasl.git
cd wasl
git checkout handoff/wasl-v2-ivory
```

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -c "import secrets;print(secrets.token_urlsafe(48))"                               # paste into JWT_SECRET
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"   # paste into ENCRYPTION_KEY
```

With `DATABASE_URL` empty and `AUTH_MODE=local`, the backend uses SQLite at `backend/wasl.db`, created and
migrated on startup.

### Frontend

```bash
cd frontend
npm ci
cp .env.example .env.local        # defaults: NEXT_PUBLIC_API_URL=http://localhost:8000, NEXT_PUBLIC_AUTH_MODE=local
```

### Run locally

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && npm run dev        # http://localhost:3000
```

Without provider keys, the app runs and every AI action shows the "AI unavailable" state. Add at least
`GROQ_API_KEY` to `backend/.env` for AI features.

### Demo database

```bash
cd backend && source .venv/bin/activate && python -m scripts.seed_demo
```

This creates a local-only demo account with a fictional sample Master CV in the SQLite database. The email and
password are defined at the top of `backend/scripts/seed_demo.py` and are for local use only. Never run it
against Supabase.

### Create a local administrator

Register an account in the UI, or use the demo account, then:

```bash
cd backend && source .venv/bin/activate
python -m scripts.admin grant <local-account-email> --reason "local dev"
python -m scripts.admin list
```

On `AUTH_MODE=local`, `--user-id` is optional. Sign in, then open http://localhost:3000/admin. The proxy sends you
through `/admin-gate`, which verifies the role and sets the HttpOnly admin cookie. Revoke with
`python -m scripts.admin revoke <email>`.

### Automated tests

```bash
cd backend && source .venv/bin/activate
ruff check app scripts tests
pytest -q                                  # SQLite, fake provider, no network
pytest -q tests/test_security.py           # authorization + PII regression
```

Supabase migrations need a throwaway local PostgreSQL 17. **Never point this at a hosted database**; the script
refuses hosted URLs and drops its own test database.

```bash
initdb -D /tmp/wasl-pg --locale=C -U postgres
pg_ctl -D /tmp/wasl-pg -o "-p 54329 -c unix_socket_directories=''" -l /tmp/wasl-pg.log start
PGURL=postgresql://postgres@localhost:54329 supabase/tests/run_local.sh
cd backend && PYTHONPATH=. DATABASE_URL=sqlite:///:memory: python ../supabase/tests/schema_drift.py postgresql+psycopg://postgres@localhost:54329/wasl_migration_test
createdb -h localhost -p 54329 -U postgres -T wasl_migration_test wasl_pytest
cd backend && WASL_TEST_DATABASE_URL=postgresql+psycopg://postgres@localhost:54329/wasl_pytest pytest -q
pg_ctl -D /tmp/wasl-pg stop
```

### Evaluation suites

```bash
cd backend && source .venv/bin/activate
python -m app.eval_v2                         # dev set, 205 cases, fails on regression vs baseline (CI gate)
python -m app.eval_v2 --dataset heldout       # held-out 1 (79) — report only; no longer independent
python -m app.eval_v2 --dataset heldout2      # held-out 2 (28) — report only; independent; 7 known failures
python -m app.evaluation --max-calls 60       # LIVE providers; needs keys; bounded budget
python -m app.evaluation --benchmark --max-calls 90
```

Results are written to `backend/eval/results/` (`.md` committed, `.json` ignored). Use `--out <stem>` for an
ad-hoc run so the committed reports are not overwritten. Never edit expectations to make a case pass, and never
add new cases to a frozen held-out set.

### Build the frontend

```bash
cd frontend
npm run lint
npm run build                 # also generates next-env.d.ts
npx tsc --noEmit
npm audit --omit=dev
```

### Browser QA (local stack only)

Run against a production build: `npm run build && npm start`, plus the backend. The `networkidle` wait hangs
under `next dev`.

```bash
cd frontend
QA_EMAIL=<local admin email> QA_PASSWORD=<its password> node scripts/qa-visual.mjs --shots ../qa-shots
QA_WIDTHS=390,1440 node scripts/qa-visual.mjs --quick     # subset
```

It uses system Google Chrome; set `CHROME_PATH` elsewhere. It refuses non-local URLs, writes `qa-report.json`,
and registers a throwaway `@example.com` user to check admin isolation.

### Monitoring and alerts

- **In-process scheduler:** on by default (`ALERT_EVAL_INTERVAL_MINUTES=5`). It is safe with several workers;
  the database lease allows one evaluation per interval.
- **Cron alternative:** set `ALERT_EVAL_INTERVAL_MINUTES=0` and schedule `python -m scripts.run_alerts` (from
  `backend/`). It prints `{"skipped": …}` when another worker holds the lease.
- **Delivery:** set `ALERT_SLACK_WEBHOOK_URL` (or `ALERT_WEBHOOK_URL` for any JSON endpoint) in the backend env,
  then use `/admin/monitoring` → Alerts → **Send test alert**.
- **Health:** `GET /api/admin/health` (admin token) shows providers configured and the scheduler's `leader` and
  `runs`.

---

## 6. Evaluation and QA results

All numbers below were produced by commands run on this codebase. Re-run them after any change.

### Deterministic regression (dev set `wasl-eval-v2.1`, verifier `claims-v2.2`)

Re-run for this handoff on 2026-11-25 at `47efe63` (`backend/eval/results/deterministic-latest.md`).

| Metric | Value |
|---|---|
| Cases | 205 / 205 passing, 0 errors |
| Claim precision / recall / F1 | 1.0 / 1.0 / 1.0 |
| False acceptance / false rejection | 0.0 / 0.0 |
| Tailoring: raw unsupported claims → after enforcement | 21 of 78 checked → 0 |
| Injection detection accuracy | 1.0 |
| PII recall / preservation | 1.0 / 1.0 |

**This is a development set.** Failures on it were used to fix root causes, so these numbers are optimistic for
unseen data.

### Independent held-out evaluation

| | Held-out 1, first run | Held-out 1, after fixes | Held-out 2, first run |
|---|---|---|---|
| Independent? | yes | **no** | **yes** (not tuned) |
| Cases passing | 63 / 79 (79.7 %) | 79 / 79 | 21 / 28 (75.0 %) |
| Claim precision / recall | 0.962 / 0.833 | 1.0 / 1.0 | 1.0 / 0.75 |
| Injection detection | 0.583 | 1.0 | 0.667 |
| PII recall / preservation | 0.957 / 1.0 | 1.0 / 1.0 | 0.667 / 1.0 |

Held-out 2 was re-run for this handoff on 2026-11-25 with identical metrics: precision 1.0, recall 0.75,
injection 0.667, PII recall 0.667. **Held-out 2 is the best available estimate of generalisation.** It is small
(28 cases) and was written by the same author as the code. The failures are listed in R-07.

### Live AI evaluation

**Not available for V2.** No provider keys were configured, so there are no live quality, latency, token or cost
numbers for V2. The October v1 run recorded in `docs/PROGRESS.md` ("17/17 real run") used a different dataset and
code, and is not comparable.

### Backend tests

| Run | Result |
|---|---|
| `ruff check app scripts tests` | pass (2026-11-25) |
| `pytest -q` on SQLite | **128 passed** (2026-11-25) |
| `pytest -q` on PostgreSQL built from `supabase/migrations` | 128 passed (2026-11-24 locally; in CI on every push) |
| `tests/test_security.py` | 76 passed |
| `tests/test_supabase_auth.py` | 9 passed |
| Required contradiction pairs | 10 / 10 blocked |
| `supabase/tests/run_local.sh` | migrations 0001 → 0004 applied twice; synthetic pre-V2 data preserved; 12/12 escalation and RLS assertions blocked |
| `schema_drift.py` | no drift |

### Frontend build

`npm run lint`, `npx tsc --noEmit` and `npm run build` (Next.js 16.4.6) pass. `npm audit --omit=dev` reports 0
vulnerabilities. Re-run for this handoff; see the final commit message.

### CI results

- GitHub Actions run [45444530875](https://github.com/Nadaalnashwan/wasl/actions/runs/45444530875) on `220f062`:
  the backend, frontend and supabase-migrations jobs all passed.
- `47efe63` (the head of `feature/wasl-v2`) passed on both the push and pull_request runs.
- Correction on record: CI on `57008ca` failed backend lint because of a duplicate import. It was fixed in
  `95f2cc5`.
- Pushing `handoff/wasl-v2-ivory` triggers CI on this branch. Check the Actions tab for its result.

### Browser testing

`frontend/scripts/qa-visual.mjs` was run against a production build on 2026-11-24.

- **Matrix:** 12 routes × 6 widths (1440, 1280, 1024, 768, 390, 320) × light/dark × English/Arabic = **288 page
  checks**.
- **Results:** 0 horizontal overflow, 0 pure-white surfaces, 0 console errors, 0 unexpected redirects.
- **Admin isolation**, checked with a freshly registered normal user:
  - the gate returned 403;
  - `/admin/monitoring` redirected to `/admin-gate`;
  - the admin API returned 403;
  - the legacy `scope=all` endpoint returned 403;
  - anonymous `/api/admin/health` returned 401.
- **Screenshots:** `docs/screenshots/v2-ivory/` (32 PNGs plus `qa-report.json`) and `docs/screenshots/before/`.

### Accessibility testing

- axe-core 4.11.0 with the WCAG 2.0, 2.1 and 2.2 A and AA rule sets: **0 violations** across the 288 checks.
- **Not tested:** screen readers, a manual keyboard walk-through of every dialog, 400 % zoom reflow, and focus-ring
  non-text contrast in every state (R-12).
- **This is not a WCAG compliance claim.**

### Monitoring validation

Real processes ran against a throwaway database and a local mock webhook (`docs/MONITORING.md`).

- The rule fired with the correct value (0.4 = 12/30).
- With two workers started together, exactly one evaluated and no duplicate notification was sent.
- Recovery was delivered.
- The lease recorded 3 runs.

Slack delivery to a real channel has **not** been verified.

### Known limitations

- **Claim verifier:** cue- and lexicon-based. It does not understand paraphrase beyond its rules. Unseen
  phrasings can slip through, as the held-out 2 recall of 0.75 shows.
- **PII redaction:** pattern-based, with no NER. Free-text names outside a CV header can survive.
- **Injection guard:** pattern-based. Homoglyphs and some Arabic imperatives are missed.
- **Costs:** estimates from list prices, not bills.
- **Supabase:** live behaviour is unverified: sign-up, email confirmation, refresh, logout, storage policies,
  advisors.
- **OAuth integrations and Slack:** unverified with real accounts.

---

## 7. Deployment runbook

**Requires the owner's explicit approval at steps 3, 5 and 7.** Do not reset the production database, recreate
auth users, change user IDs, drop tables or disable RLS. Full details are in `docs/SUPABASE_MIGRATION.md`.

1. **Pre-checks (read-only):** R-01 and R-02. Save the §4 query output and both Advisors reports.
2. **Backup:** from a trusted machine, run
   `pg_dump "$SESSION_POOLER_URL" --schema=public --format=custom --file=wasl-pre-v2-$(date +%F).dump`. Verify it
   with `pg_restore --list wasl-pre-v2-*.dump | head`. Store it **outside** the repository. Free-plan projects
   have daily backups but no point-in-time recovery, so this dump is the rollback point.
3. **Migrate (approval):** in the SQL editor, apply `0003_v2_security.sql`, then `0004_v2_performance.sql`, in
   that order. Each is idempotent. Expect brief `ACCESS EXCLUSIVE` locks per `ADD COLUMN` and `CREATE INDEX`.
   The tables are small.
4. **Post-migration checks:**
   - re-run the §4 queries;
   - `select role, count(*) from public.users group by 1` should show only `user`;
   - row counts should equal the pre-check counts;
   - re-run Advisors.
5. **Deploy the backend (approval):**
   - merge the reviewed PR, then deploy on Render with the production environment from §4: `APP_ENV=production`,
     `AUTH_MODE=supabase`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`,
     `ENCRYPTION_KEY`, provider keys, `CORS_ORIGINS`, `FRONTEND_URL` and `BACKEND_URL`;
   - startup runs the additive migrator, which is a no-op after step 3;
   - check that `GET /api/health` returns `{"status":"ok"}`.
6. **Deploy the frontend:** on Vercel, set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AUTH_MODE=supabase`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `API_URL_INTERNAL`, then deploy.
7. **Admin (approval):** R-04. Then configure `ALERT_SLACK_WEBHOOK_URL` and send a test alert (R-09).
8. **Post-deployment verification:**
   - sign up with a new test address, confirm the email, sign in, refresh, sign out;
   - add an achievement, generate a post (shown as a draft), and do the CV upload, parse and accept flow;
   - export PDF and DOCX;
   - run tailoring and a gap analysis;
   - a normal user gets 403 on `/api/admin/*` and is redirected away from `/admin`;
   - an admin sees metrics, and `/api/admin/health` shows `ai_providers_configured` and the scheduler `leader`;
   - the browser console shows no errors, and no secret appears in any network response.
9. **Security checks:**
   - Supabase Security advisor shows no new errors;
   - `users` grants match §2 of `docs/SUPABASE_MIGRATION.md`;
   - with the anon key, a client `update users set role='admin'` fails with 42501;
   - CORS allows only the frontend origin;
   - `APP_ENV=production` is set;
   - `AI_REDACT_PII=true` and `AI_ENABLE_FAKE_PROVIDER=false`;
   - no `NEXT_PUBLIC_*` variable holds a secret.

**Rollback:**

- **Application:** redeploy the previous Render and Vercel releases. The v1 backend ignores the new columns and
  tables, so this is usually enough.
- **Schema, only if required:** run the SQL in `docs/SUPABASE_MIGRATION.md` §5. It drops the V2 triggers and
  functions and restores the earlier grants. `0004` needs no rollback.
- **Data:** none expected. Restore from the step 2 dump only as a last resort, and only with approval.

---

## 8. Continuation checklist

Start at the top. Each item links to its task in §3.

1. [ ] Read this file, then `docs/WASL_V2_IMPLEMENTATION.md` and `docs/SUPABASE_MIGRATION.md`.
2. [ ] Run §5 locally and confirm 128 tests pass, the dev set is 205/205 and the frontend builds, before changing
   anything.
3. [ ] **R-15**: get the owner's confirmation that v1 keys were rotated.
4. [ ] **R-01**: free a Supabase slot and restore `wasl project` (owner).
5. [ ] **R-02**: read-only production inspection; reconcile any drift with `0003`.
6. [ ] **R-05 / R-06**: add provider secrets, run the live evaluation and benchmark, and record the real numbers.
7. [ ] **R-13**: settle the canonical production URLs.
8. [ ] Owner reviews draft PR #1 (or a PR from this branch). **Only the owner merges.**
9. [ ] **R-03**: backup, then apply `0003` and `0004` (owner approval).
10. [ ] **R-14**: deploy the backend, then the frontend; run the §7 post-deployment checks.
11. [ ] **R-04**: grant the owner admin (owner approval). **R-09**: Slack test alert.
12. [ ] **R-10 / R-11**: GitHub and LinkedIn OAuth with test accounts. Publish nothing without approval.
13. [ ] **R-07**: write and freeze held-out 3, then fix the 7 held-out 2 gaps. **R-08**: PII and secret detection.
14. [ ] **R-12**: manual accessibility pass.

**Ground rules for whoever continues:**

- Keep PRs in draft until the owner reviews them, and never merge into `main` yourself.
- Never commit `.env` files, keys, admin emails or IDs, real CVs, or the local `*.db` files.
- Never change evaluation expectations to make a case pass.
- Never label a deterministic number as live.
- Report what was not verified.

---

## 9. Reference map

| Topic | Document | Key source files |
|---|---|---|
| Product overview | `README.md` | — |
| Architecture | `docs/ARCHITECTURE.md` | `backend/app/main.py`, `app/ai/router.py`, `app/ai/workflows/*` |
| V2 audit → change traceability | `docs/WASL_V2_IMPLEMENTATION.md` | — |
| Design system | `docs/DESIGN_SYSTEM.md` | `frontend/src/app/globals.css`, `src/components/ui/*` |
| Security, roles, admin provisioning | `docs/SECURITY.md` | `app/security/*`, `scripts/admin.py`, `frontend/src/proxy.ts` |
| Privacy and redaction | `docs/PRIVACY.md` | `app/security/pii.py`, `app/ai/router.py` |
| Models and routing | `docs/AI_MODEL_REGISTRY.md` | `app/ai/model_registry.py`, `app/ai/pricing.py` |
| Evaluation | `docs/EVALUATION.md` | `app/eval_v2.py`, `app/evaluation.py`, `backend/eval/**` |
| Monitoring and alerts | `docs/MONITORING.md` | `app/monitoring/*`, `scripts/run_alerts.py` |
| Supabase migration runbook | `docs/SUPABASE_MIGRATION.md` | `supabase/migrations/*`, `supabase/tests/*` |
| Setup | `docs/SETUP.md` | `backend/.env.example`, `frontend/.env.example`, `app/config.py` |
| QA evidence | `docs/QA_REPORT.md` | `frontend/scripts/qa-visual.mjs`, `.github/workflows/ci.yml` |
| Historical (v1, Oct 2026) | `docs/PROGRESS.md`, `docs/REPORT.md`, `docs/PITCH.md` | — |
