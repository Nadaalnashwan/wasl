# Wasl deterministic evaluation — wasl-eval-v2.1

Verifier: `claims-v2.2` · Commit: `aafe8d5` · Run: 2026-11-24T16:31:23.736557+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 205 |
| errors | 0 |
| case_pass_rate | 1.0 |
| ai_quality_case_pass_rate | 1.0 |
| claim_detection_precision | 1.0 |
| claim_detection_recall | 1.0 |
| claim_detection_f1 | 1.0 |
| false_acceptance_rate | 0.0 |
| false_rejection_rate | 0.0 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 21 |
| tailor_claims_checked | 78 |
| injection_detection_accuracy | 1.0 |
| pii_recall | 1.0 |
| pii_preservation | 1.0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| achievement_extraction | 26 | 26 | 1.0 |
| arabic_mixed | 20 | 20 | 1.0 |
| cv_parsing | 33 | 33 | 1.0 |
| cv_tailoring | 31 | 31 | 1.0 |
| hallucination | 30 | 30 | 1.0 |
| linkedin_content | 25 | 25 | 1.0 |
| privacy | 20 | 20 | 1.0 |
| prompt_injection | 20 | 20 | 1.0 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 18 | 18 | 1.0 |
| en | 181 | 181 | 1.0 |
| mixed | 6 | 6 | 1.0 |

## Failed cases (0)

| Case | Category | Failed checks / error |
|---|---|---|
