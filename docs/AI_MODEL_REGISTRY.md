# AI model registry

Source of truth: `backend/app/ai/model_registry.py` (`REGISTRY_VERSION = 2026-11-24.1`). A live snapshot with
privacy eligibility and prices is served to admins at `GET /api/admin/monitoring/models`.

## Models (verified against official model lists on 2026-11-24)

| Provider | Tier | Model id (env override) | List price $/1M in · out |
|---|---|---|---|
| Groq | quality | `openai/gpt-oss-120b` (`GROQ_MODEL_QUALITY`) | 0.15 · 0.60 |
| Groq | fast | `openai/gpt-oss-20b` (`GROQ_MODEL_FAST`) | 0.075 · 0.30 |
| Gemini | quality | `gemini-3.8-flash` (`GEMINI_MODEL_QUALITY`) | 0.75 · 3.75 (until 2026-12-31) |
| Gemini | fast | `gemini-3.5-flash-lite` (`GEMINI_MODEL_FAST`) | 0.30 · 2.50 |
| OpenRouter | both | `meta-llama/llama-3.3-70b-instruct:free` (`OPENROUTER_MODEL`) | 0 · 0 |

v1 defaulted Gemini to `gemini-3.5-flash`, which is **not** a model id in Google's model list; it was replaced.
Prices live in `app/ai/pricing.py` (`PRICING_VERSION = 2026-11-24`) and only feed **estimates**.

## Tasks

| Task | Tier | Temp | Max tokens | Sensitivity | Purpose |
|---|---|---|---|---|---|
| `post_generation` | quality | 0.7 | 1200 | personal | LinkedIn post from one confirmed achievement |
| `post_improve` | quality | 0.4 | 1000 | personal | Rewrite / remove flagged claims |
| `achievement_extraction` | quality | 0.1 | 1500 | personal | Achievements + verbatim quotes from text/files |
| `repo_analysis` | quality | 0.1 | 1500 | personal | Achievements from a GitHub repository bundle |
| `cv_parse` | quality | 0.0 | 3500 | personal | Structure an uploaded CV (redacted) |
| `cv_update` | quality | 0.2 | 1500 | personal | Master CV change proposal |
| `cv_tailor` | quality | 0.2 | 3000 | personal | Reorder/rephrase existing CV content |
| `gap_roadmap` | quality | 0.3 | 2000 | personal | Learning roadmap |
| `job_profile` | fast | 0.0 | 800 | personal | Search titles/skills from the Master CV |
| `job_requirements` | fast | 0.0 | 1200 | public | Requirements from one job description |
| `job_requirements_batch` | fast | 0.0 | 2500 | public | Requirements from many public job ads |

All tasks use JSON mode + Pydantic validation, a per-attempt timeout (`AI_TIMEOUT_SECONDS`, 45 s), bounded retries
(`AI_MAX_RETRIES`, 2, exponential backoff honouring `Retry-After`), one repair round-trip on invalid JSON, and a hard
deadline across all attempts and fallbacks (`AI_TOTAL_DEADLINE_SECONDS`, 120 s). If `Retry-After` exceeds the
remaining budget the router moves to the next provider instead of waiting.

**Primary / fallback:** the first privacy-eligible provider in `AI_PROVIDER_PRIORITY` is primary; the remaining
eligible providers are approved fallbacks, in order. With the default priority `groq,gemini,openrouter` and no
Gemini paid-tier attestation, personal tasks route Groq → OpenRouter, and public tasks Groq → Gemini → OpenRouter.

## Traceability

Each provider attempt writes an `ai_events` row: request id, task, provider, **requested model**, **returned model**
(from the provider response; Gemini `modelVersion`, OpenAI-compatible `model`), registry version, attempt number,
fallback flag, status and error class, HTTP status, latency, prompt/completion tokens, estimated cost, pricing
version, privacy level and the number of redacted values. No prompt or completion text is stored. Evaluation runs
store the models actually used (`eval_runs.model`); when none succeeded the field says so explicitly.

## Provider comparison

`python -m app.evaluation --benchmark --max-calls N` runs the same cases on each configured provider separately
(budget split evenly) and writes `eval/results/benchmark-latest.md` with task success, extraction accuracy, quote
verification, raw and final unsupported-claim rates, latency, tokens, estimated cost and privacy-blocked counts.
It needs real provider keys; see `docs/EVALUATION.md` for the current status.
