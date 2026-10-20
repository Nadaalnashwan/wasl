# Monitoring & Evaluation

Every number on the Monitoring page is computed by `backend/app/monitoring/metrics.py` from rows written by the running
product. Nothing is sampled, mocked or pre-filled; an empty database shows an empty state.

## Monitoring Flow

```mermaid
flowchart LR
  subgraph Product["Product (FastAPI request)"]
    U["User action<br/>e.g. Generate post"] --> MW["HTTP middleware<br/>main.monitor_requests"]
    MW --> RT["Router + LangGraph workflow"]
    RT --> AR["AI Model Router<br/>run_structured()"]
    AR -->|each provider attempt| P["Groq / Gemini / OpenRouter"]
    RT --> CC["Claim checker / evidence verifier"]
    RT --> TT["deps.track_task()"]
    RT --> UX["User decisions<br/>Accept · Edit · Reject · Confirm · Publish"]
  end

  subgraph Record["Recorder (monitoring/recorder.py)<br/>own DB session · metadata only · scrubbed"]
    E1[("http_events<br/>route template, status, latency")]
    E2[("ai_events<br/>request_id, task, provider, model, attempt,<br/>status, error_type, latency, tokens, fallback")]
    E3[("quality_events<br/>claim_check, task_completed/failed,<br/>cv_suggestion_decision, achievement_feedback,<br/>publish_result, injection_detected")]
    E4[("error_logs<br/>error id, type, scrubbed message")]
    E5[("eval_runs<br/>offline evaluation results")]
  end

  MW --> E1
  MW -. unhandled exception .-> E4
  AR --> E2
  CC --> E3
  TT --> E3
  UX --> E3
  EV["python -m app.evaluation<br/>eval/dataset.json"] --> E5

  subgraph Compute["metrics.compute(window, scope)"]
    AGG["group attempts by request_id →<br/>failure rate, fallback rate, retries<br/>percentiles p50/p95/p99<br/>tokens by provider/task<br/>unsupported-claim rate<br/>CV acceptance, extraction precision<br/>task success, 5xx rate"]
    AL["evaluate_alerts()<br/>threshold rules (ALERT_* env)"]
    AGG --> AL
  end
  E1 & E2 & E3 & E4 & E5 --> AGG
  AL --> API["GET /api/monitoring/metrics"]
  AGG --> API
  API --> DASH["Monitoring dashboard<br/>KPIs · alerts with 'how to investigate' · charts · tables"]
```

## Metric catalog — what, why, how it helps

| Metric | Source | Why it matters | How it helps investigate |
|---|---|---|---|
| **AI requests / attempts / retried** | `ai_events` grouped by `request_id` | load and retry pressure | many attempts per request ⇒ unstable provider |
| **AI failure rate** | requests with no successful attempt | what users actually feel | alert > `ALERT_FAILURE_RATE` (20%); check *Error types* |
| **Error types** | `ai_events.error_type` | root cause class | `rate_limit` = free-tier quota · `auth` = bad/expired key · `validation` = model broke the schema · `timeout` = slow provider · `no_provider` = no key configured |
| **p50 / p95 / p99 latency** (+ end-to-end p95 over time) | successful attempts; sum of attempts per request | tail latency drives UX; averages hide it | rising p95 with flat volume ⇒ provider slowdown; compare per-provider p95 |
| **Fallback rate** | successful requests served by a non-primary candidate | early warning before failures show | alert > 30%; look at primary provider's recent failures |
| **Tokens by provider & task** | `prompt_tokens`, `completion_tokens` | cost / free-tier budget | find the task that burns quota (e.g. CV parsing) |
| **Unsupported-claim rate** | `quality_events(kind=claim_check)` | hallucination proxy — core product promise | alert > 10%; which task? tighten prompt, force revise |
| **CV update acceptance rate** | Accept/Edit vs Reject decisions | usefulness of AI-drafted CV changes | many rejects ⇒ proposals irrelevant or badly phrased |
| **Extraction precision (proxy)** | confirmed vs rejected AI-discovered achievements | quality of discovery agent | low ⇒ extraction too eager; review prompt/confidence |
| **Task success rate** | `task_completed` vs `task_failed` per task | end-to-end health incl. DB + validation | isolates which user journey is broken |
| **Prompt-injection flags** | `injection_detected` events | security signal | spikes ⇒ someone probing uploads/READMEs |
| **API 5xx rate, 4xx, per-route p95** | `http_events` (route templates, no ids) | application health | 5xx ⇒ bug; each user error message carries an id found in *Recent server errors* |
| **Evaluation results** | `eval_runs` | quality before release | compare runs when changing prompts or models |

## Example investigation

1. Alert: *AI request failure rate is high — 42% (threshold 20%)*.
2. *Error types*: `rate_limit` dominates; *Providers* table: `groq` success 55%, `gemini` 0 attempts.
3. Diagnosis: Groq free-tier quota exhausted and no second provider configured → fallback impossible.
4. Fix: add `GEMINI_API_KEY` (router falls back automatically) or lower token budgets; fallback rate rises, failure rate drops.

## Privacy

`ai_events` store sizes and counts (input characters, token counts), never prompt or completion text. CV contents, API keys and OAuth
tokens are never logged. Error messages pass through `recorder.scrub()` (API-key patterns, bearer tokens, emails redacted).
Scope **Whole platform** shows aggregates only; **My requests** filters to the current user.

## Alerts

Defined in `metrics.evaluate_alerts()`; thresholds come from env (`ALERT_FAILURE_RATE`, `ALERT_P95_LATENCY_MS`,
`ALERT_UNSUPPORTED_CLAIM_RATE`, `ALERT_FALLBACK_RATE`). Minimum sample sizes prevent alerts on tiny data. Alerts are shown on the
dashboard with an *investigate* hint; wiring them to email/Slack is a documented next step.
