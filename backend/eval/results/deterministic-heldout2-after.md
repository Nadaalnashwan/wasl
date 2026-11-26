# Wasl deterministic evaluation — wasl-heldout-2.0

Verifier: `claims-v2.3` · Commit: `6770763` · Run: 2026-11-25T23:26:57.977676+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 28 |
| errors | 0 |
| case_pass_rate | 1.0 |
| ai_quality_case_pass_rate | 1.0 |
| claim_detection_precision | 1.0 |
| claim_detection_recall | 1.0 |
| claim_detection_f1 | 1.0 |
| false_acceptance_rate | 0.0 |
| false_rejection_rate | 0.0 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 0 |
| tailor_claims_checked | 0 |
| injection_detection_accuracy | 1.0 |
| pii_recall | 1.0 |
| pii_preservation | 1.0 |
| injection_precision | 1.0 |
| injection_recall | 1.0 |
| claim_confusion | tp=12, fn=0, fp=0, tn=4, n=16 |
| injection_confusion | tp=4, fn=0, fp=0, tn=2, n=6 |
| pii_strings | must_remove=6, false_negatives=0, must_keep=9, false_positives=0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| claims | 16 | 16 | 1.0 |
| injection | 6 | 6 | 1.0 |
| pii | 6 | 6 | 1.0 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 4 | 4 | 1.0 |
| en | 23 | 23 | 1.0 |
| mixed | 1 | 1 | 1.0 |

## Failed cases (0)

| Case | Category | Failed checks / error |
|---|---|---|
