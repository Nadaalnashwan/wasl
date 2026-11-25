# Wasl deterministic evaluation — wasl-heldout-1.0

Verifier: `claims-v2.3` · Commit: `135ea6c` · Run: 2026-11-25T23:29:28.764127+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 79 |
| errors | 0 |
| case_pass_rate | 1.0 |
| ai_quality_case_pass_rate | 1.0 |
| claim_detection_precision | 1.0 |
| claim_detection_recall | 1.0 |
| claim_detection_f1 | 1.0 |
| false_acceptance_rate | 0.0 |
| false_rejection_rate | 0.0 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 9 |
| tailor_claims_checked | 38 |
| injection_detection_accuracy | 1.0 |
| pii_recall | 1.0 |
| pii_preservation | 1.0 |
| injection_precision | 1.0 |
| injection_recall | 1.0 |
| claim_confusion | tp=30, fn=0, fp=0, tn=7, n=37 |
| injection_confusion | tp=8, fn=0, fp=0, tn=4, n=12 |
| pii_strings | must_remove=23, false_negatives=0, must_keep=30, false_positives=0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| claims_ar_mixed | 10 | 10 | 1.0 |
| claims_en | 27 | 27 | 1.0 |
| injection | 12 | 12 | 1.0 |
| pii | 16 | 16 | 1.0 |
| privacy | 3 | 3 | 1.0 |
| tailoring | 11 | 11 | 1.0 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 12 | 12 | 1.0 |
| en | 65 | 65 | 1.0 |
| mixed | 2 | 2 | 1.0 |

## Failed cases (0)

| Case | Category | Failed checks / error |
|---|---|---|
