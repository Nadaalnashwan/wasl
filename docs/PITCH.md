# Pitch — 3 minutes + 10 minutes Q&A

## 3-minute pitch (≈ 400 words)

| Time | Slide | Say / show |
|---|---|---|
| 0:00–0:25 | **Problem** | "You finish a project. Then you write it for LinkedIn, again for your CV, again for each job. Most people skip it — and AI writers that help also *invent* numbers and skills." |
| 0:25–0:45 | **Wasl** (logo + machine illustration) | "Wasl — وصل — connects your achievements to your career. Document once, use everywhere. Nothing invented." |
| 0:45–1:45 | **Live demo** | 1) Paste a description → Discovery extracts an achievement with *verified quotes* → Confirm. 2) Wasl auto-drafts a CV update → side-by-side → **Accept** → Master CV v2. 3) Post Studio → Arabic post + claim check ✓. 4) Tailor to a job → match score with formula, *honesty guard blocked 1 bullet*. |
| 1:45–2:30 | **Engineering** | Three LangGraph agents; AI router across Groq & Gemini with retries, fallback and schema validation; deterministic claim checker; prompt-injection guard; encrypted keys; RLS. |
| 2:30–2:55 | **Monitoring** | Open the dashboard: failure rate, p95, fallback rate, tokens, unsupported-claim rate, CV acceptance rate — computed from real events; alerts tell you *how to investigate*. Evaluation dataset with adversarial and Arabic cases. |
| 2:55–3:00 | **Close** | "Wasl: your achievements, verified once, working everywhere." |

**Demo safety:** seed the demo account (`python -m scripts.seed_demo`), keep the Groq + Gemini keys configured, and have a screen recording as backup.

## Q&A preparation (any team member should be able to answer)

**Product**
* *Who is it for?* Students, interns, early-career engineers — bilingual EN/AR.
* *Why not ChatGPT?* No source of truth, no versioned CV, no verification, no publishing workflow, no monitoring.

**Architecture**
* *Why LangGraph?* Explicit graph = explainable steps; conditional edge for revise; easy to test node-by-node.
* *Why own adapters instead of SDKs?* Uniform error classes (timeout / rate_limit / auth …) are what the router and monitoring need.
* *How does fallback respect privacy?* `allow_cross_provider=false` sends data only to the first provider; `personal` mode never uses platform keys unless allowed.
* *How do you prevent duplicate LinkedIn posts?* Atomic `UPDATE … WHERE status IN (draft, failed, uncertain)` lock; timeouts become `uncertain` and require the user to confirm before retry.

**AI quality**
* *How do you stop hallucinations?* Prompts + **code**: quotes must exist in the source, unsupported skills dropped, claim checker on every output, tailoring enforcement keeps original bullets when a rewrite adds claims, CV changes applied by code to a copy.
* *Limits?* Lexical checker misses paraphrased falsehoods; small eval set; LLM nondeterminism (temperature low for extraction).
* *Prompt injection?* Instruction-like sentences redacted, hidden Unicode stripped, data delimited, outputs validated — and counted on the dashboard.

**Monitoring & evaluation**
* *Why these metrics?* Each answers a question: are users failing (failure rate), why (error types), is it slow (p95), is the primary degrading (fallback rate), what does it cost (tokens), is it truthful (unsupported claims), is it useful (CV acceptance, extraction precision).
* *Walk through an incident.* See MONITORING.md "Example investigation".
* *How is evaluation reproducible?* Fixed dataset + explicit checks in code; results stored per run with provider/model.

**Development**
* *Tools used & verification?* Claude Code for generation; humans reviewed; verified with 23 tests, lint, type checks, build, browser walk-throughs; bugs found and fixed are listed in REPORT.md §3.
* *Security?* Fernet-encrypted tokens/keys, backend-only provider keys, OAuth state, RLS, upload validation, scrubbed logs.
