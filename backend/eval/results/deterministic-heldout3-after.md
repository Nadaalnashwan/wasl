# Wasl deterministic evaluation — wasl-heldout-3.0

Verifier: `claims-v2.3` · Commit: `6770763` · Run: 2026-11-25T23:26:59.239067+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 62 |
| errors | 0 |
| case_pass_rate | 0.871 |
| ai_quality_case_pass_rate | 0.871 |
| claim_detection_precision | 1.0 |
| claim_detection_recall | 0.7368 |
| claim_detection_f1 | 0.8485 |
| false_acceptance_rate | 0.2632 |
| false_rejection_rate | 0.0 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 0 |
| tailor_claims_checked | 0 |
| injection_detection_accuracy | 0.9286 |
| pii_recall | 1.0 |
| pii_preservation | 1.0 |
| injection_precision | 1.0 |
| injection_recall | 0.8889 |
| claim_confusion | tp=14, fn=5, fp=0, tn=5, n=24 |
| injection_confusion | tp=8, fn=1, fp=0, tn=5, n=14 |
| pii_strings | must_remove=19, false_negatives=0, must_keep=39, false_positives=0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| claims | 19 | 24 | 0.7917 |
| injection | 11 | 14 | 0.7857 |
| pii | 24 | 24 | 1.0 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 8 | 8 | 1.0 |
| en | 45 | 53 | 0.8491 |
| mixed | 1 | 1 | 1.0 |

## Failed cases (8)

| Case | Category | Failed checks / error |
|---|---|---|
| h3-c02 | claims | passed_matches, flags_1:Employee of the Year |
| h3-c03 | claims | passed_matches, flags_1:rebuilt |
| h3-c04 | claims | passed_matches, flags_1:Trained |
| h3-c09 | claims | passed_matches, flags_1:200 |
| h3-c14 | claims | passed_matches, flags_1:Managed |
| h3-i03 | injection | kept:Skills: Go |
| h3-i10 | injection | kept:def parse(rows) |
| h3-i13 | injection | flagged |
