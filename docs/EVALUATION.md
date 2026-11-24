# Evaluation

Wasl has two complementary evaluations. They answer different questions and their numbers must never be mixed.

| | Deterministic suite (`app/eval_v2.py`) | Live evaluation (`app/evaluation.py`) |
|---|---|---|
| Question | Do Wasl's safeguards (claim verifier, tailoring enforcement, evidence checks, PII redaction, injection filter, skill matching, privacy policy) give the right answer? | How well do real models perform on Wasl's tasks, and what do they cost? |
| AI provider | **none** — fixed, hand-written adversarial inputs and "model outputs" go through production code | real Groq / Gemini / OpenRouter calls |
| Runs | every push and PR (CI), baseline-gated | manual / weekly / release, budget-capped (`--max-calls`) |
| Stored as | `eval_runs.kind = deterministic` | `kind = live` or `benchmark`, with actual model ids |

## 1. Deterministic suite v2

`backend/eval/v2/*.json` — **205 cases**, each with an id, category, language, one-sentence purpose, input and a
ground-truth expectation written by a reviewer (synthetic people and data only).

| Category | Cases | What is exercised |
|---|---:|---|
| CV parsing & extraction | 33 | PII redaction on real-world CV headers (Saudi/international phones, Arabic-Indic digits, Iqama, DOB, links, referees, banners) with must-remove **and** must-keep strings; skill evidence (verified / listed-only / missing) |
| Achievement extraction | 26 | evidence-quote verification (fabricated, paraphrased, near-number quotes), hallucinated technologies, team/repo contribution confirmation, low-information text |
| LinkedIn content | 25 | faithful posts that must pass vs inflated metrics, invented employers/titles/awards, team→individual credit, unconfirmed repo contribution |
| CV tailoring | 31 | real tailoring enforcement on adversarial rewrites (moved metrics, grafted skills, invented degrees/awards, summary rewrites) + job-requirement matching |
| Hallucination & contradiction | 30 | all ten required contradiction pairs + supported controls (paraphrases of the same facts) |
| Prompt injection | 20 | instructions hidden in CVs / READMEs / job ads (English, Arabic, tables, role tags) + benign look-alikes that must not be flagged |
| Arabic & mixed | 20 | Arabic claims, PII and injection |
| Privacy | 20 | IBAN/card/API-key/JWT edge cases, numbers that must be kept, provider eligibility per task and key source |

Privacy/authorization **software** tests (401/403 matrix, IDOR, payload capture) live in
`tests/test_security.py` and are reported separately; they are not part of any "AI accuracy" number.

### How a claim is judged

`app/ai/claims.py` (verifier `claims-v2.1`) splits generated text into sentences and extracts checkable atoms:
numbers with unit classes, skills, credentials and places, leadership verbs, attribution, job titles, named
employers/organisations, and prestige words (best, top, keynote, doubled…). Each atom is compared with the
evidence sentences and gets a status with reason codes and the supporting evidence span:
**supported**, **unsupported** (e.g. `number_unit_mismatch`, `skill_studied_only`, `credential_attended_only`,
`credential_planned_only`, `role_inflated`, `team_size_as_reports`, `entity_not_in_evidence`,
`number_wrong_context`), **contradicted** (`skill_negated`, `attributed_to_other`, `place_mismatch`),
**needs_confirmation** (`team_vs_individual`, `contribution_unconfirmed`), **ambiguous** (`number_unit_unclear`,
non-blocking), **unavailable** (the verifier failed — never reported as verified). Output passes only with no
unsupported, contradicted, needs-confirmation or unavailable claim. The verifier is deterministic (no LLM): it
cannot be prompt-injected, is free, and gives identical results in CI. It does not judge the generating model with
the same model's self-reported confidence.

### Metrics and denominators

* **Claim detection** (65 claim-check cases): positive class = "the text contains an unsupported claim".
  Precision = tp ÷ (tp + fp); recall = tp ÷ (tp + fn); false acceptance = fn ÷ (tp + fn) (unsupported text let through);
  false rejection = fp ÷ (fp + tn) (faithful text blocked).
* **Tailoring**: raw unsupported claims in adversarial rewrites; post-enforcement = cases whose *final* tailored CV still
  fails re-verification (target 0).
* **PII recall** = removed ÷ PII strings that must be removed; **preservation** = kept ÷ task strings that must be kept.
* **Case pass rate**: a case passes only if every one of its checks passes.

### Results

The suite was written blind (expectations were never changed to match the system). The first run found 57 failing
cases; those failures were then used to fix root causes in the code. Because the fixes were made **while looking at
this same suite**, the "after" column is a development-set result and is optimistic for unseen data — a fresh
held-out set is the next step (see limitations).

| Metric | Initial (blind) | After fixes (same suite) |
|---|---:|---:|
| Cases passing | 148 / 205 (72.2 %) | **193 / 205 (94.1 %)** |
| Claim detection precision | 0.822 (tp 37, fp 8) | 1.000 (tp 42, fp 0) |
| Claim detection recall | 0.860 (fn 6) | 0.977 (fn 1) |
| False acceptance rate | 0.140 | 0.023 |
| False rejection rate | 0.364 | 0.000 |
| Tailored CVs failing final re-verification | 1 | **0** |
| Injection detection accuracy | 0.68 | 1.00 |
| PII recall / preservation | 0.841 / 0.963 | 0.984 / 1.000 |
| Arabic cases passing | 11 / 18 | 18 / 18 |

Reports: `eval/results/deterministic-initial.md`, `eval/results/deterministic-latest.md`. CI fails if the case
pass rate, claim precision/recall or PII recall drop below `eval/baseline_deterministic.json`.

**Still failing (12):** no-number outcome inventions in tailoring ("reduced churn"), a tool swapped within the same
family (Tableau ↔ Power BI) in tailoring, overly broad lexicon groups (Tableau → "Data Visualization", "ML"), a
merged first line (`Name Python SQL Tableau`), one ordinal case, extraction confidence calibration on vague text,
and two expectation choices the dataset author flagged as debatable (ext-010: zero candidates for no-achievement
text; li-021: which reason code applies).

## 2. Why offline 0 % and live 5.4 % unsupported claims disagreed (v1)

They measured different things:

| | v1 offline report | v1 live dashboard |
|---|---|---|
| Population | 4 LinkedIn posts from 17 easy cases | every `claim_check` event in production: posts, CV updates **and tailoring** |
| Stage | **after** the revise step (final posts) | posts after revise, but tailoring rows counted **before** enforcement (`unsupported_found`) |
| Denominator | claims in those 4 posts (count not recorded in the v1 report) | all claims checked across tasks |

So the live rate mixed pre-enforcement tailoring output (where the model's fabrications are *expected* and then
removed) with post-enforcement posts, while the offline figure only looked at cleaned posts on easy inputs. v2
records every claim check with an explicit **stage** — `raw` (model output), `final` (what the user receives),
`approved` (published / accepted) — reports them separately in the admin console, and treats a zero-claim sample
as "insufficient data", not 0 %.

## 3. Live evaluation and provider benchmark

```bash
python -m app.evaluation --max-calls 60                 # v1 cases + 20 v2 adversarial evidence → real posts
python -m app.evaluation --benchmark --max-calls 90     # same cases per provider, budget split evenly
```

Measured per run: task success, extraction case accuracy and skill precision/recall, evidence-quote verification
rate, **raw** (first draft) and **final** unsupported-claim rates for posts, tailoring invention rate, provider calls,
tokens, p50/p95 latency, estimated cost, privacy-blocked tasks, and the exact model ids that answered. The run stops
when `--max-calls` is reached. Without a real provider key it refuses to run instead of producing placeholder
numbers.

**Status:** not run for v2 — no provider API keys were available in the implementation environment. The last live
run on record (v1, 2026-10-21, Groq `openai/gpt-oss-120b` / `20b`, 17 cases) remains in `eval/results/latest.md`; it
predates verifier v2 and is not comparable with the numbers above. Run the `Live AI evaluation` workflow (repository
secrets `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) to produce v2 live and benchmark results.

## 4. Limitations

* After-fix numbers are on the development set; add a held-out set written by someone who has not seen the code.
* Cue-based verification misses fabrications with no number, skill, credential, role, attribution, title,
  organisation or prestige cue (e.g. "reduced churn").
* Prompt-injection detection is pattern-based; it is a first layer, with delimiting, schema validation and claim
  verification behind it.
