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

`app/ai/claims.py` (verifier `claims-v2.2`) splits generated text into sentences and extracts checkable atoms:
numbers with unit classes, skills, credentials and places, leadership verbs, attribution, job titles, named
employers/organisations, prestige and vague-impact words (best, top, keynote, doubled, "the first", significantly, eliminated…), and creation claims ("I built X"). v2.2 also determines **who** performed an action (self, team, a named other person, passive "led by X", Arabic verb-first order): a creation or role that the evidence credits to someone else is contradicted, team work claimed individually needs confirmation. Each atom is compared with the
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

### Results — development set (`wasl-eval-v2.x`, 205 cases)

The suite was written blind (expectations never changed to match the system). Its failures were then used to fix
root causes, so **every "after" column on this set is a development-set result and optimistic for unseen data.**

| Metric | Initial (blind, verifier v2.0) | After v2.1 fixes | After v2.2 fixes (2026-11-24) |
|---|---:|---:|---:|
| Cases passing | 148 / 205 (72.2 %) | 193 / 205 (94.1 %) | **205 / 205** |
| Claim detection precision | 0.822 (tp 37, fp 8) | 1.000 | 1.000 (tp 43, fp 0) |
| Claim detection recall | 0.860 (fn 6) | 0.977 (fn 1) | 1.000 (fn 0) |
| False acceptance / false rejection | 0.140 / 0.364 | 0.023 / 0.000 | 0.000 / 0.000 |
| Tailored CVs failing final re-verification | 1 | 0 | 0 (21 raw unsupported claims in 78 checked, all removed) |
| Injection detection accuracy | 0.68 | 1.00 | 1.00 |
| PII recall / preservation | 0.841 / 0.963 | 0.984 / 1.000 | 1.000 / 1.000 |
| Arabic cases passing | 11 / 18 | 18 / 18 | 18 / 18 |

The 12 cases still failing after v2.1 and their root causes (all fixed by general changes, no case-specific
rules): tool families merged in the skills lexicon (Tableau ≡ Power BI; 4 cases), ambiguous aliases never matched
in context ("ML model", "Node backend"; 2), vague low-information text keeping high confidence (1), fabricated
quotes about non-professional text still surfaced (ext-010; 1), a name merged with the skills column on a PDF's
first line (1), one role-inflation case reporting only one of its two valid reasons (li-021; 1), an invented
"the first …" superlative (1) and the Arabic verb-first attribution regression introduced and fixed in v2.2 (1).

Two expectations (ext-004, tai-026) named the skill by the old lexicon family label "Data Visualization". The
label was changed to the tool's own name ("Power BI", "Tableau"); the expected behaviour stated in each case's
`purpose` is unchanged and the original expectation is kept in the case's `expect_history` (dataset → v2.1).

## 1b. Held-out sets (independent of tuning)

Two further sets, each **frozen in its own commit before its first run** (`a170c42`, `aafe8d5`), with new
synthetic people, employers and wording. Their expectations state what a correct safeguard *should* do,
including cases the cue-based verifier was expected to miss. They are report-only (`python -m app.eval_v2
--dataset heldout|heldout2`), never a CI gate.

| Metric | Held-out 1 — first run (independent) | Held-out 1 — after fixes (**not** independent) | Held-out 2 — first run (independent, not tuned) |
|---|---:|---:|---:|
| Dataset / verifier | wasl-heldout-1.0 / claims-v2.1 | wasl-heldout-1.0 / claims-v2.2 | wasl-heldout-2.0 / claims-v2.2 |
| Cases passing | 63 / 79 (79.7 %) | 79 / 79 | 21 / 28 (75.0 %) |
| Claim precision (tp / tp+fp) | 0.962 (25 / 26) | 1.000 (30 / 30) | 1.000 (9 / 9) |
| Claim recall (tp / tp+fn) | 0.833 (25 / 30) | 1.000 (30 / 30) | 0.750 (9 / 12) |
| False acceptance (fn / positives) | 0.167 | 0.000 | 0.250 |
| False rejection (fp / negatives) | 0.143 (1 / 7) | 0.000 | 0.000 (0 / 4) |
| Injection detection accuracy | 0.583 (7 / 12) | 1.000 | 0.667 (4 / 6) |
| PII recall / preservation | 0.957 / 1.000 | 1.000 / 1.000 | 0.667 / 1.000 |
| Tailoring: final CVs still failing | 0 | 0 | — (no tailoring cases) |

Held-out 1 misses (first run) drove v2.2: misattributed authorship ("Sara built the dashboard" → "I built…"),
roles held by someone else ("led by Fahad"), a colleague's award, vague outcome inflation, a tool swap within a
family, "owned" as role inflation, five injection forms (HTML comment addressed to the AI, JSON chat role,
letter-spaced "I-g-n-o-r-e", tool-call exfiltration, mid-line "NEW INSTRUCTIONS:") and an Iqama number whose
label suffix was matched case-sensitively.

**Held-out 2 is the best available estimate of generalisation after the fixes** and its 7 misses are known,
unfixed gaps: a shortlisting claimed as a win, a team's migration claimed in the first person singular without a
creation verb, an Arabic verb-first attribution to a colleague with the verb repeated in the output, Greek
look-alike letters in "Ιgnore", an Arabic instruction to give the highest score phrased with "أعطِ", a header
name separated from the email by " - ", and a Slack webhook URL not recognised as a secret. Fixing them would make
held-out 2 a development set too; the next step is a held-out 3 written by someone who has not read the code.

These are **deterministic safeguard** measurements on fixed inputs and fixed "model outputs". They are not
live model-generation accuracy (section 3).

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

**Status:** not run for v2 — no provider API keys were available in the implementation environment
(re-checked 2026-11-24: only `.env.example` files exist locally; no `GROQ_API_KEY`, `GEMINI_API_KEY` or
`OPENROUTER_API_KEY` in the environment). The last live
run on record (v1, 2026-10-21, Groq `openai/gpt-oss-120b` / `20b`, 17 cases) remains in `eval/results/latest.md`; it
predates verifier v2 and is not comparable with the numbers above. Run the `Live AI evaluation` workflow (repository
secrets `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) to produce v2 live and benchmark results.

## 4. Limitations

* Dev-set and held-out-1 "after" numbers are not independent. Held-out 2 is independent but small (28 cases) and
  was written by the same author as the code; a held-out set from someone outside the project is still needed.
* Cue-based verification misses fabrications with no number, skill, credential, role, attribution, title,
  organisation or prestige cue (e.g. "reduced churn").
* Prompt-injection detection is pattern-based; it is a first layer, with delimiting, schema validation and claim
  verification behind it.
