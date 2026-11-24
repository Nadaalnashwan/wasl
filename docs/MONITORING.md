# Monitoring and alerting

Monitoring is an **administrative** feature. Normal users never see operational data: the user navigation,
dashboard, landing page and settings contain no monitoring links or metrics. Admins use `/admin/monitoring`
(server-gated, see `docs/SECURITY.md`), backed by `/api/admin/*`.

## What is recorded

| Table | One row per | Content (metadata only) |
|---|---|---|
| `ai_events` | provider **attempt** | task, provider, requested + returned model, registry/pricing version, attempt, fallback, status, error class, HTTP status, latency, tokens, estimated cost, privacy level, redaction count |
| `http_events` | API request | method, **route template** (no ids/query), status, latency |
| `quality_events` | product outcome | task completion (+ end-to-end duration), claim checks per **stage**, CV review decisions, achievement feedback, publish results, injection flags (counts) |
| `error_logs` | unhandled error | route, error class, scrubbed message (secrets + PII removed) |
| `eval_runs` | evaluation run | kind (deterministic / live / benchmark), dataset + verifier version, provider, model, summary |
| `alert_incidents` | alert episode | rule key, severity, value, threshold, sample size, lifecycle, delivery status |
| `admin_audit_log` | admin action | role grants/revokes, admin API access, denied attempts, test alerts |

Monitoring writes use their own short-lived session; a failed telemetry write never fails the user's request.

## Metric definitions

A **logical request** is one `run_structured` call (all attempts sharing a `request_id`); an **attempt** is one
provider call. Rates with no data are returned as `null` and shown as *N/A* — never as 0 or "healthy".

| Metric | Definition (denominator) |
|---|---|
| AI failure rate | logical requests with no successful attempt ÷ logical requests |
| Attempt error rate | failed attempts ÷ attempts |
| Fallback rate | successful requests answered by a non-primary provider ÷ successful requests |
| Attempt latency p50/p95/p99 | successful attempts only (provider time) |
| End-to-end latency | sum of all attempts of a successful logical request (includes retries) |
| Workflow duration | wall time of the whole user task (`track_task`), e.g. tailor = requirements + matching + tailoring + enforcement |
| Raw unsupported-claim rate | unsupported + contradicted claims ÷ claims checked in the **model's output before enforcement** (first post draft, all proposed CV changes, all tailored bullets) |
| Post-enforcement rate | same, in what users **receive** (post after the revise step, applied CV changes, accepted tailored bullets) |
| Unsupported blocked | raw unsupported − post-enforcement unsupported |
| Unsupported escaped | unsupported claims in **approved** output (published posts) that the user did **not** explicitly acknowledge, plus anything still flagged when the final tailored CV is re-verified. Target: 0. |
| Estimated cost | Σ attempts (tokens × list price), retries and fallbacks included; `null` when a model has no verified price. **Not a bill**: free-tier platform keys cost $0 and BYOK is billed to the user. Split by task, model, provider and platform vs BYOK. |

How claims are judged is documented in `backend/app/ai/claims.py` and `docs/EVALUATION.md`.

## Dashboard

`/admin/monitoring` — Overview, Application health, AI performance, AI quality, Evaluation, Providers & models,
Cost & usage, Alerts & incidents, Audit log; filters for 1/7/30/90 days, provider, model and task; sample sizes next
to every rate; definitions inline.

## Alerting (independent of the dashboard)

`app/monitoring/alerts.py`. An in-process scheduler evaluates every rule every `ALERT_EVAL_INTERVAL_MINUTES`
(default 5), independently of anyone opening the console. With several workers or instances each one runs the
loop, but a database lease (`scheduler_leases`, a single conditional `UPDATE`) lets exactly one evaluate per
interval, and a unique partial index allows at most one **open** incident per rule key even if two cycles race.
`python -m scripts.run_alerts` (cron) uses the same lease. The console shows the shared last run, leader and
last error. Admins can also
trigger "Evaluate now". Each rule opens **one** incident per key; while it keeps firing it is updated, not
duplicated; reminders respect `ALERT_COOLDOWN_MINUTES`; when it clears the incident resolves and a recovery
message is sent. Delivery: Slack incoming webhook (`ALERT_SLACK_WEBHOOK_URL`) or any JSON webhook
(`ALERT_WEBHOOK_URL`), three attempts with backoff, status stored per incident. With neither set, incidents are
persisted and shown in the console with "external delivery disabled".

| Rule | Fires when (24 h window) | Severity |
|---|---|---|
| `ai_failure_rate` | ≥ `ALERT_MIN_SAMPLE` (20) requests and failure rate > 10 % | critical |
| `provider_outage:<p>` | ≥ 20 attempts on a provider and its success rate < 50 % | critical |
| `p95_latency` | ≥ 20 successes and attempt p95 > 20 s | warning |
| `fallback_rate` | ≥ 20 successes and fallback rate > 25 % | warning |
| `rate_limits` | ≥ 10 rate-limit errors | warning |
| `raw_unsupported_claims` | ≥ 20 claims checked and raw rate > 8 % | warning |
| `claims_escaped` | **any** unsupported claim in approved output without a user-written assertion | critical |
| `verifier_failures` | ≥ 3 outputs where the claim verifier could not run | warning |
| `http_5xx` | ≥ 20 requests and 5xx rate > 5 % | critical |
| `cost_spike` | today's estimated cost > `ALERT_DAILY_COST_USD` ($5) | warning |
| `monitoring_silent` | traffic in the last 7 days but no HTTP events for 6 h | warning |
| `eval_regression:<metric>` | latest deterministic eval run drops > 2 points vs the previous one | warning |
| `privacy_no_provider` | a personal-data task found no privacy-eligible provider in the last hour | critical |

Why these thresholds: v1 alerted at a 10 % unsupported rate measured on a mix of stages, which both hid blocked
fabrications and alerted on small samples. v2 alerts on the **raw** model rate (early warning while users are
still protected) at 8 %, treats a single **escape** as an incident, and requires 20 samples for every rate rule so
a handful of requests cannot page anyone. The 20 s latency threshold is a conservative upper bound, not a
measured baseline: no production traffic was available in the v2 working environment. Re-baseline it from the
console's p95 after a week of real traffic.

Alert payloads contain rule keys, numbers and sample sizes only — never user identifiers, emails, CV text,
prompts or tokens.

### Validation (2026-11-24)

Run with real processes against a throwaway SQLite database seeded with 30 synthetic AI events (12 failing)
and a **local mock webhook** (not Slack):

| Step | Result |
|---|---|
| Cycle 1 | `ai_failure_rate` fired with value 0.4 (12/30), n = 30; incident opened; one webhook delivery |
| Next interval, two `run_alerts` processes started together | exactly one evaluated (still firing, **no** second notification inside the cooldown); the other reported "another worker holds the alert lease" |
| Failures cleared, next interval | incident resolved; recovery message delivered; `recovery_notified = true` |
| Lease row | 3 runs, no error |

Also covered by tests: dedupe/cooldown/recovery (`test_alert_cycle_opens_dedupes_and_resolves`), lease takeover
after expiry, database rejection of a duplicate open incident, tiny-sample suppression. **Not verified:** delivery
to a real Slack workspace (no webhook was provided) — configure `ALERT_SLACK_WEBHOOK_URL` and use "Send test
alert".
