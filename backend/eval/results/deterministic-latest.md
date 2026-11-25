# Wasl deterministic evaluation — wasl-eval-v2.2

Verifier: `claims-v2.3` · Commit: `6770763` · Run: 2026-11-25T23:26:55.577281+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 240 |
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
| injection_precision | 1.0 |
| injection_recall | 1.0 |
| claim_confusion | tp=49, fn=0, fp=0, tn=27, n=76 |
| injection_confusion | tp=23, fn=0, fp=0, tn=12, n=35 |
| pii_strings | must_remove=78, false_negatives=0, must_keep=160, false_positives=0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| achievement_extraction | 26 | 26 | 1.0 |
| arabic_mixed | 29 | 29 | 1.0 |
| cv_parsing | 35 | 35 | 1.0 |
| cv_tailoring | 31 | 31 | 1.0 |
| hallucination | 37 | 37 | 1.0 |
| linkedin_content | 25 | 25 | 1.0 |
| privacy | 32 | 32 | 1.0 |
| prompt_injection | 25 | 25 | 1.0 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 27 | 27 | 1.0 |
| en | 207 | 207 | 1.0 |
| mixed | 6 | 6 | 1.0 |

## Failed cases (0)

| Case | Category | Failed checks / error |
|---|---|---|
