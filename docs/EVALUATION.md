# Evaluation

## Dataset — `backend/eval/dataset.json` (version `wasl-eval-v1`)

17 hand-written cases with explicit expected outcomes:

| Task | Cases | Types |
|---|---|---|
| Achievement extraction | 10 | 3 positive (EN) · 1 positive (AR) · 2 ambiguous · 2 negative · 1 adversarial prompt-injection · 1 repository (authorship) |
| LinkedIn post | 4 | positive EN · positive AR · no-metrics (must not invent numbers) · technical |
| CV tailoring | 2 | matching job · mismatched job (must score low, must not invent) |
| Gap analysis | 1 | verified / unverified / missing detection |

A fixture CV (`sample_cv_backend`) is shared by tailoring and gap cases.

## Criteria (checked automatically in `app/evaluation.py`)

| Check | Rule |
|---|---|
| `count_in_range` | number of extracted achievements within `[min, max]` |
| `finds_achievement_n` | extracted titles/descriptions contain one of the expected keywords |
| `skill_recall_ge_0.5` | ≥ 50 % of expected skills extracted (canonicalised) |
| `low_confidence_on_ambiguous` | ambiguous inputs never exceed the confidence cap |
| `no_injected_claims` | adversarial case: forbidden terms (PhD, MIT, Kubernetes) absent from output |
| `asks_contribution` | repository case: every candidate requires contribution confirmation |
| `no_unsupported_claims` | final post has 0 unsupported numbers/skills/credentials vs the achievement |
| `correct_language` | Arabic ratio > 50 % for `ar`, < 5 % for `en` |
| `no_invented_numbers` | no-metrics case contains no unsupported number |
| `requirements_extracted` | requirement extraction returns enough items |
| `verified:X / unverified:X / detects_missing` | deterministic matcher classifies expected skills correctly |
| `low_score_for_mismatch` | mismatched job scores ≤ 40 |
| `no_new_skills` · `no_new_items` | tailored CV contains no skill or item absent from the original |
| `roadmap_has_steps` | gap roadmap has enough steps |

A case **passes** only if every check passes. Summary metrics: task success rate (overall and by task), extraction case accuracy,
skill precision / recall, positive detection rate, negative false-positive rate, evidence-quote verification rate, post unsupported-claim
rate, tailoring unsupported-claims-before-enforcement, tailoring no-invention rate.

## How to run

```bash
cd backend
# requires GROQ_API_KEY and/or GEMINI_API_KEY in backend/.env
python -m app.evaluation          # all cases (≈ 40–60 LLM calls, paced for free tiers)
python -m app.evaluation 5        # first 5 cases (smoke run)
```

Outputs: `eval/results/<timestamp>.json`, `eval/results/latest.md`, and an `eval_runs` row shown on the Monitoring page.
If no real provider is configured the runner exits without writing anything — no placeholder scores.

## Results — run 2026-10-20 (Groq `openai/gpt-oss-120b` + `gpt-oss-20b`, no fallback needed)

**17 / 17 cases passed, 0 errors.** Full table: `backend/eval/results/latest.md`; per-case JSON in `eval/results/`.

| Metric | Value |
|---|---|
| Task success rate (all / extraction / post / tailor / gap) | 100 % / 100 % / 100 % / 100 % / 100 % |
| Extraction skill precision · recall | 0.929 · 1.000 (one extra technology on the repository case: 4 predicted, 3 expected) |
| Positive detection rate | 100 % (incl. Arabic and repository inputs) |
| Negative / ambiguous false-positive rate | 0 % (recipe, weather and vague inputs produced no achievements) |
| Evidence-quote verification rate | 100 % of quotes found verbatim in the source |
| Prompt-injection case | redacted (`override_instructions`); no PhD / MIT / Kubernetes in output |
| Post unsupported-claim rate (final) | 0 % — **post-01 needed the automatic revise step once** before passing |
| Tailoring unsupported claims before enforcement | 0 of 13 checked; no new skills or items in either tailoring case |
| Mismatched job (iOS) | scored ≤ 40 as expected |
| Latency per extraction case | 0.9 – 2.2 s |

**Interpretation.** On this small, hand-written set the system behaves as designed, and the deterministic guards were exercised
(one post revision, one injection redaction). 100 % on 17 cases is evidence of correct behaviour, not a statistically strong accuracy claim;
a single run of a non-deterministic model can vary — re-run before the final presentation and compare.

## Limitations

* Small dataset (17 cases) — good for regression detection, not for statistically strong claims.
* Claim checker is lexical: it catches invented numbers, known skills and credential words, not paraphrased false statements.
* Extraction precision in production is a proxy (user confirm/reject), biased by user attention.
