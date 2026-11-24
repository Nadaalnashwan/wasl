# Wasl deterministic evaluation — wasl-heldout-1.0

Verifier: `claims-v2.1` · Commit: `a170c42` · Run: 2026-11-24T16:20:33.635312+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 79 |
| errors | 0 |
| case_pass_rate | 0.7975 |
| ai_quality_case_pass_rate | 0.7895 |
| claim_detection_precision | 0.9615 |
| claim_detection_recall | 0.8333 |
| claim_detection_f1 | 0.8928 |
| false_acceptance_rate | 0.1667 |
| false_rejection_rate | 0.1429 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 6 |
| tailor_claims_checked | 28 |
| injection_detection_accuracy | 0.5833 |
| pii_recall | 0.9565 |
| pii_preservation | 1.0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| claims_ar_mixed | 9 | 10 | 0.9 |
| claims_en | 22 | 27 | 0.8148 |
| injection | 7 | 12 | 0.5833 |
| pii | 15 | 16 | 0.9375 |
| privacy | 3 | 3 | 1.0 |
| tailoring | 7 | 11 | 0.6364 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 12 | 12 | 1.0 |
| en | 50 | 65 | 0.7692 |
| mixed | 1 | 2 | 0.5 |

## Failed cases (16)

| Case | Category | Failed checks / error |
|---|---|---|
| ho-a08 | claims_ar_mixed | passed_matches, supported_2:40 |
| ho-c03 | claims_en | passed_matches, flags_1:designed |
| ho-c13 | claims_en | passed_matches, flags_1:Led |
| ho-c15 | claims_en | passed_matches, flags_1:award |
| ho-c19 | claims_en | passed_matches, flags_1:built |
| ho-c26 | claims_en | passed_matches, flags_1:eliminating |
| ho-i01 | injection | flagged |
| ho-i07 | injection | flagged |
| ho-i09 | injection | flagged |
| ho-i10 | injection | flagged |
| ho-i12 | injection | flagged |
| ho-p02 | pii | removed:2345678901 |
| ho-t04 | tailoring | rejected_bullets_min, absent:Tableau |
| ho-t07 | tailoring | rejected_bullets_min, absent:Owned the survey |
| ho-t08 | tailoring | rejected_bullets_min, absent:significantly improving |
| ho-s01 | tailoring | verified:Power BI, verified:Excel, missing:Tableau |
