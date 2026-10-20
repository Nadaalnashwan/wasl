# Wasl — Project Report

*AI Product Development and Monitoring — Tuwaiq Academy × Meta × Startupbootcamp — 22 Oct 2026*

## 1. Problem

Students and early-career professionals in Saudi Arabia document the same achievement repeatedly: a LinkedIn post, a CV line,
a tailored CV per application. It is slow, inconsistent, and often skipped — so real work stays invisible. Generic AI writers speed
this up but introduce a new problem: **they invent** numbers, skills and titles, which is risky in hiring.

## 2. Solution

Wasl keeps one verified source of truth — confirmed achievements and an approved, versioned Master CV — and generates everything
from it with code-enforced honesty:

* **Discovery agent** extracts achievements from text, documents or GitHub; verifies quotes against the source; asks for personal contribution.
* **Content agent** writes LinkedIn posts (6 tones, EN/AR), claim-checks and revises them; publishing needs explicit confirmation.
* **CV agent** drafts Master-CV updates into a separate draft (Accept / Edit / Reject), tailors CVs without invention, analyses skill gaps.
* **Monitoring & Evaluation** measures reliability, cost and output quality from real events.

## 3. Tools & technical decisions

| Area | Choice | Why (vs alternatives) |
|---|---|---|
| Backend | FastAPI + Pydantic 2 + SQLAlchemy 2 | typed request/response validation; same models on SQLite and Postgres |
| Orchestration | LangGraph | explicit state machines (generate → check → revise) that are easy to explain and test; lighter than multi-agent frameworks |
| LLM access | own httpx adapters (Groq, Gemini, OpenRouter) | avoids SDK lock-in, uniform error classification for the router, tiny dependency footprint |
| Models | Groq `gpt-oss-120b` / `gpt-oss-20b` (primary), Gemini `3.5-flash` (fallback) | free tiers, JSON mode; Groq < 1 s latency; two vendors enable fallback. Chosen after the planned Llama 3.x / Gemini 2.5 models returned `model_not_found` for new keys |
| Verification | deterministic claim checker + skill lexicon | explainable and testable; LLM-as-judge would be non-deterministic and cost tokens |
| Database / auth | Supabase Postgres + Auth + RLS + Storage; SQLite + local JWT for dev | managed security in production, zero-setup local development (documented dual mode) |
| Frontend | Next.js 16, TypeScript, Tailwind 4, Radix (shadcn pattern), Recharts | accessible primitives, fast iteration, charts for monitoring |
| Documents | pypdf, python-docx, fpdf2 + HarfBuzz | pure-Python, Arabic shaping for PDF export |
| Security | Fernet encryption, scrypt, PyJWT | standard primitives; no custom crypto |

**Simplifications (deliberate):** Supabase SDK is not used on the backend (direct Postgres + REST for Storage — fewer moving parts);
no admin dashboard (provider config lives in backend env as required); alerts are shown in-app rather than pushed to email/Slack.

**AI-assisted development:** the codebase was produced with an AI coding assistant (Claude Code) under human direction. Verification:
23 automated tests (unit + end-to-end API journeys with a deterministic fake LLM), ruff, TypeScript strict mode, ESLint (React compiler
rules), production build, and browser walk-throughs of each page in English and Arabic, light and dark. Bugs found this way and fixed:
line-level injection redaction removing legitimate text, `.test` emails rejected at login, an SVG filter re-rendering every animation frame,
unlabelled form fields, monitoring not counting failed calls when no provider was configured, and retired model names (Llama 3.x on Groq, Gemini 2.5) — surfaced as provider 404s, now classified as `model_not_found` on the dashboard.

## 4. Data

* **User data**: achievements, CVs, posts — stored per user, isolated by `user_id` and RLS. Uploaded files in a private bucket.
* **Evaluation data**: `backend/eval/dataset.json` — 17 hand-written cases (positive, Arabic, ambiguous, negative, adversarial,
  repository-authorship, mismatched job) with expected outcomes. No external benchmark fits this exact task; the dataset is small by design
  to run on free tiers and is meant for regression detection.
* **Skill lexicon**: 81 canonical skills with English/Arabic aliases (`ai/skills.py`), used for explainable matching.

## 5. Monitoring — selected metrics

Reliability (AI failure rate, error types, fallback rate, retries, API 5xx), performance (p50/p95/p99, end-to-end p95 over time),
cost (tokens by provider and task), AI quality (unsupported-claim rate, CV acceptance rate, extraction precision proxy, task success),
security (prompt-injection flags). Each metric's purpose and diagnostic use: [MONITORING.md](MONITORING.md). Threshold alerts include an
"how to investigate" hint. Diagrams: [Development Flow](ARCHITECTURE.md#development-flow), [Monitoring Flow](MONITORING.md#monitoring-flow).

## 6. Evaluation results

| Item | Result |
|---|---|
| Automated tests | **23 / 23 pass** (guardrails, claim checker, skill matching, router retry/fallback/repair, BYOK rules, uploads, exports, auth isolation, CV Accept/Edit/Reject/stale, tailoring enforcement, gap statuses, monitoring) |
| Frontend | type-check, lint and production build pass |
| Real-model evaluation (Groq gpt-oss, 2026-10-20) | **17/17 cases pass**; skill precision 0.93 / recall 1.00; 0 % false positives on negative/ambiguous inputs; 100 % evidence quotes verified; 0 % unsupported claims in final posts (1 post auto-revised); 0 invented skills/items in tailoring ([EVALUATION.md](EVALUATION.md)) |
| Live system check | Groq and Gemini validated; fallback verified (invalid Groq key → Gemini); real workflows run end-to-end through the API; Monitoring shows the resulting events |

## 7. Limitations & next steps

Lexical claim checker (misses paraphrased falsehoods) · small eval set · LinkedIn/GitHub/Supabase flows implemented but awaiting real
credentials for live verification · alerts not yet pushed to external channels · scanned-image certificates need OCR.

## 8. References

FastAPI, Pydantic, SQLAlchemy, LangGraph (LangChain Inc.), Next.js, Tailwind CSS, Radix UI, Recharts, Supabase docs (RLS, Auth, Storage),
LinkedIn *Share on LinkedIn* & *Sign In with LinkedIn using OpenID Connect* docs, GitHub OAuth Apps docs, Groq API, Google Gemini API,
Fernet spec (cryptography.io), OWASP LLM Top 10 (LLM01 Prompt Injection, LLM09 Misinformation).
