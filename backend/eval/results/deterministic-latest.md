# Wasl deterministic evaluation — wasl-eval-v2.0

Verifier: `claims-v2.1` · Commit: `4a28acf` · Run: 2026-11-24T03:36:13.671379+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 205 |
| errors | 0 |
| case_pass_rate | 0.9415 |
| ai_quality_case_pass_rate | 0.9351 |
| claim_detection_precision | 1.0 |
| claim_detection_recall | 0.9767 |
| claim_detection_f1 | 0.9882 |
| false_acceptance_rate | 0.0233 |
| false_rejection_rate | 0.0 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 17 |
| tailor_claims_checked | 72 |
| injection_detection_accuracy | 1.0 |
| pii_recall | 0.9841 |
| pii_preservation | 1.0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| achievement_extraction | 22 | 26 | 0.8462 |
| arabic_mixed | 20 | 20 | 1.0 |
| cv_parsing | 32 | 33 | 0.9697 |
| cv_tailoring | 26 | 31 | 0.8387 |
| hallucination | 30 | 30 | 1.0 |
| linkedin_content | 23 | 25 | 0.92 |
| privacy | 20 | 20 | 1.0 |
| prompt_injection | 20 | 20 | 1.0 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 18 | 18 | 1.0 |
| en | 169 | 181 | 0.9337 |
| mixed | 6 | 6 | 1.0 |

## Failed cases (12)

| Case | Category | Failed checks / error |
|---|---|---|
| ext-004 | achievement_extraction | cand1_kept:Data Visualization |
| ext-008 | achievement_extraction | cand1_max_confidence |
| ext-010 | achievement_extraction | n_candidates |
| ext-023 | achievement_extraction | cand1_kept:Machine Learning |
| cvp-023 | cv_parsing | removed:Reem Al-Shehri |
| tai-012 | cv_tailoring | rejected_bullets_min, absent:churn |
| tai-014 | cv_tailoring | rejected_bullets_min, absent:built tableau dashboards, present:built power bi dashboards |
| tai-023 | cv_tailoring | rejected_bullets_min |
| tai-026 | cv_tailoring | unverified:Data Visualization |
| tai-028 | cv_tailoring | verified:Node.js |
| li-021 | linkedin_content | reason_1:role_inflated |
| li-025 | linkedin_content | passed_matches, flags_1:first |
