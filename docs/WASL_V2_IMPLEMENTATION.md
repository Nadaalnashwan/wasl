# WASL V2 — implementation record

Branch `feature/wasl-v2`, based on `main` at `1704ae8`. This file is the persistent checklist and the map from the
independent review and the instructor's feedback to code and evidence.

## 1. Audit findings (revalidated against 1704ae8) → tasks

| # | Finding | Still true at 1704ae8? | v2 task / result |
|---|---|---|---|
| 1–2 | "Sketchbook" design: handwritten fonts, irregular borders, hard shadows, gears, illustrations, notebook grid | Yes (`globals.css`, `components/sketch/illustrations.tsx`, Patrick Hand/Marhey) | Design system v2 (`docs/DESIGN_SYSTEM.md`); illustrations, sketch CSS and fonts deleted; every page redesigned |
| 3 | Monitoring in the normal user navigation | Yes (`/monitoring` in `app-shell.tsx`) | Removed from user app; separate `/admin` console |
| 4–5 | Monitoring endpoints only checked authentication; `scope=all` exposed global metrics to any user | Yes (`routers/monitoring.py`) | `require_admin` on `/api/admin/*`; legacy endpoints admin-only |
| 6 | No admin role | Yes | `users.role`, CLI provisioning, audit log, DB triggers |
| 7–8 | Direct SQLAlchemy may bypass RLS; ownership needs full coverage | Yes | Backend authorization documented as primary control; remaining indirect lookups hardened; IDOR tests |
| 9 | CV text sent to providers without PII redaction | Yes (`parse_cv` sanitised injections only) | Central `Redactor` at the provider boundary + payload tests |
| 10–11 | Claim check lexical; numbers lose units/context | Yes (`claims.py` v1) | Claim verifier v2 (units, negation, attribution, roles, planned vs done, credentials) |
| 12 | Saved evaluation has 17 cases | Yes | Deterministic adversarial suite v2 (see `docs/EVALUATION.md`) + live suite with budget |
| 13 | Evaluation API returns empty `model` | Yes (hard-coded `""`) | `eval_runs.model` stored and returned; "unavailable" stated explicitly |
| 14 | Alerts computed only when metrics are requested | Yes | Scheduler + incidents + Slack/webhook delivery |
| 15 | Unsupported-claim alert at 10 % | Yes | Raw-rate warning at 8 % with sample floor; any escape is critical |
| 16 | Router has tiers/retries/fallback | Yes | Kept; added registry, privacy filter, total deadline, traceability |
| — | Discovery router (document upload, GitHub scan) existed but was not mounted | **New finding** | Mounted; exposed on the new Achievements page |
| — | Configured Gemini default `gemini-3.5-flash` is not a listed model id | **New finding** | Replaced with verified ids |
| — | Next.js 16.4.2 affected by moderate advisories | **New finding** (`npm audit`) | Upgraded to 16.4.6 |
| — | Unapplied `0003` allowed client self-promotion (`SECURITY DEFINER` + column-level revoke) | **New finding (v2.1)**, proven on a Supabase-like Postgres | Fixed before any deployment; 12 database-level assertions in CI |
| — | `posts.images` missing from all Supabase migrations | **New finding (v2.1)** | Added to `0003` and the startup migrator |
| — | Supabase tokens not checked for issuer | **New finding (v2.1)** | `iss` + required claims enforced; 9 crypto tests |
| — | Generic checkbox could publish unsupported claims | **New finding (v2.1)** | Per-claim user-written assertions, stored as user-asserted |
| — | Alert scheduler duplicated work with several workers | **New finding (v2.1)** | DB lease + unique open-incident index; verified with two concurrent processes |

## 2. Checklist

- [x] Phase 0 — branch, audit, baseline (32 backend tests passing at start)
- [x] Phase 1 — admin role + authorization, legacy endpoint lockdown, ownership hardening, migrations, PII redaction, provider privacy policy, security tests
- [x] Phase 2 — design system v2; landing, auth, dashboard, achievements, CV, studio, jobs, tailor, gap, settings redesigned; desktop/mobile/RTL/dark checked in a browser
- [x] Phase 3 — claim verifier v2, evidence spans, raw/final/approved stages, publish acknowledgement, model registry, traceability, privacy-safe fallback
- [x] Phase 4 — deterministic evaluation runner + dataset, live evaluation budget + benchmark, CI workflows
- [x] Phase 5 — admin API, metrics v2, cost estimates, alerts + incidents, admin console UI
- [x] Phase 6 (v2.1, 2026-11-24) — warm "Ivory" design system on every page; Supabase migration review on a
      Supabase-like local Postgres (critical role-escalation bug in the unapplied 0003 fixed, 0004 added);
      Supabase token verification hardened and tested; per-claim user assertions for publishing; alert
      scheduler safe with several workers; claim verifier v2.2; two frozen held-out evaluation sets;
      288-check responsive + axe QA on a production build
- [ ] Live provider evaluation and benchmark — **blocked**: no provider API keys in this environment (see §4)
- [ ] Live Supabase inspection — **blocked**: project paused; restore refused by the free-plan project limit
- [ ] Production rollout — needs the owner's approval (`docs/SUPABASE_MIGRATION.md` §6)
- [x] Handoff (2026-11-26) — branch `handoff/wasl-v2-ivory`, [`HANDOFF.md`](../HANDOFF.md) with prioritised remaining tasks

## 3. Instructor feedback traceability

The original evaluation (7.8/10) is not re-scored here.

| Original instructor feedback | Implementation | Changed files | Verification evidence | Status |
|---|---|---|---|---|
| Enforce authorization in backend code; direct DB connections may bypass RLS | `require_admin`, DB-read role, `owned()` coverage, version check on CV save; RLS kept as defence in depth + role triggers | `security/authz.py`, `routers/admin.py`, `routers/monitoring.py`, `routers/{posts,career,cv,jobs,auth}.py`, `supabase/migrations/0003_v2_security.sql` | `tests/test_security.py`: 401/403/200 matrix over 15 routes, forged-role token, self-promotion, revocation, cross-user CV/achievement/post/export; browser check of `/admin` as a normal user | Implemented and verified |
| Pin and expose the actual model used per task in the authorised monitoring interface | Model registry per task; requested + returned model on every attempt; registry/pricing versions; model table in admin console | `ai/model_registry.py`, `ai/router.py`, `ai/providers/gemini.py`, `monitoring/metrics.py`, `frontend/src/app/admin/monitoring/models` | `test_router_records_model_and_cost_traceability`; `test_monitoring_reflects_real_events` asserts model rows | Implemented and verified (with fake provider) |
| Separate held-out evaluation | Two frozen held-out sets (79 + 28 cases) committed before their first runs; report-only | `eval/heldout*/`, `app/eval_v2.py` | held-out 1 first run 63/79; held-out 2 21/28 (independent) | Implemented and measured |
| Compare providers on quality and cost | `python -m app.evaluation --benchmark` (same cases per provider, budget-split) + cost estimates from verified list prices | `evaluation.py`, `ai/pricing.py`, `.github/workflows/live-eval.yml` | Code path implemented; **no measured comparison** — needs provider keys | Implemented, blocked by credentials |
| Offline 0 % vs live 5.4 % unsupported claims; dataset too easy | Root cause documented (different stages and populations); stages now separated; adversarial deterministic suite in CI; live suite adds v2 adversarial evidence | `ai/claims.py`, `eval_v2.py`, `eval/v2/*.json`, `monitoring/recorder.py`, `.github/workflows/ci.yml` | `eval/results/deterministic-latest.md`; `docs/EVALUATION.md` | Implemented; deterministic results measured, live blocked |
| Regression evaluation whenever relevant code changes | CI runs tests + security suite + deterministic eval with a baseline gate on every push/PR | `.github/workflows/ci.yml`, `eval/baseline_deterministic.json` | Workflow file; local run of the same commands (QA report) | Implemented; first CI run happens on push |
| Track latency percentiles, tokens, fallback rates, unsupported claims, meaningful thresholds | Metrics v2 (attempt vs end-to-end, workflow duration, per-model, cost, staged claims, N/A for no data); thresholds justified | `monitoring/metrics.py`, `docs/MONITORING.md` | Journey + security tests over real events | Implemented and verified |
| Explain how claims are judged | Verifier documentation, reason codes, evidence spans, UI explanations | `ai/claims.py`, `components/claims.tsx`, `docs/EVALUATION.md` | 16 contradiction scenarios + suite results | Implemented and verified |
| Deliver alerts to an external channel | Scheduler, incidents, dedupe/cooldown/recovery, Slack/webhook with retries, test-alert button | `monitoring/alerts.py`, `scripts/run_alerts.py`, `main.py` | `test_alert_cycle_opens_dedupes_and_resolves` (mocked delivery) | Implemented; real Slack delivery not exercised (no webhook configured) |
| Redact contact details before sending CVs to providers | Central `Redactor` with local restore; scrubbed logs | `security/pii.py`, `ai/router.py`, `ai/workflows/career.py`, `monitoring/recorder.py` | Outbound payload capture test; 20 detector tests; eval `pii_recall` | Implemented and verified |
| Use verified privacy and retention configurations | Provider privacy levels from official docs; personal tasks restricted; OpenRouter ZDR routing; Gemini free tier excluded | `ai/model_registry.py`, `ai/providers/openai_compat.py`, `docs/PRIVACY.md` | Policy tests incl. BYOK and fallback; OpenRouter request-body test | Implemented and verified; account-level ZDR is an operator attestation |

## 4. Known limitations

* Live AI quality, provider benchmark and real latency/cost figures were not measured: no provider keys were
  available. The runners refuse to produce numbers without a real provider.
* The claim verifier is deterministic and cue-based; paraphrased fabrications without a number, skill,
  credential, leadership or attribution cue can pass. Measured rates are in `docs/EVALUATION.md`.
* Names of third parties inside CVs (references) are redacted only when labelled.
* Groq ZDR and Gemini paid tier cannot be detected through the API; they are operator attestations.
* External alert delivery was tested with a mocked transport and a local mock webhook only (no real Slack).
* The real Supabase project could not be inspected (paused; restore refused by the plan's project limit); all
  Supabase findings come from a faithful local reproduction of its roles and grants.
* Held-out 2 exposes 7 known, unfixed gaps (listed in `docs/EVALUATION.md` §1b).
