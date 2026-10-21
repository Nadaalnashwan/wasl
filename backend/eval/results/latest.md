# Wasl evaluation — wasl-eval-v1

Run: 2026-10-21T15:48:07.267198+00:00
Provider(s): groq
Model(s): openai/gpt-oss-120b, openai/gpt-oss-20b

## Summary

| Metric | Value |
|---|---|
| cases | 17 |
| errors | 0 |
| task_success_rate | 1.0 |
| extraction_case_accuracy | 1.0 |
| extraction_skill_precision | 0.929 |
| extraction_skill_recall | 1.0 |
| positive_detection_rate | 1.0 |
| negative_false_positive_rate | 0.0 |
| evidence_quote_verification_rate | 1.0 |
| post_unsupported_claim_rate | 0.0 |
| posts_revised | 1 |
| tailor_unsupported_before_enforcement | 0 |
| tailor_claims_checked | 12 |
| tailor_no_invention_rate | 1.0 |
| success rate: extraction | 1.0 |
| success rate: post | 1.0 |
| success rate: tailor | 1.0 |
| success rate: gap | 1.0 |

## Cases

| Case | Task | Type | Result | Failed checks |
|---|---|---|---|---|
| ext-01 | extraction | positive | PASS | — |
| ext-02 | extraction | positive | PASS | — |
| ext-03 | extraction | positive | PASS | — |
| ext-04 | extraction | positive_ar | PASS | — |
| ext-05 | extraction | ambiguous | PASS | — |
| ext-06 | extraction | ambiguous | PASS | — |
| ext-07 | extraction | negative | PASS | — |
| ext-08 | extraction | negative | PASS | — |
| ext-09 | extraction | adversarial | PASS | — |
| ext-10 | extraction | repository | PASS | — |
| post-01 | post | positive | PASS | — |
| post-02 | post | positive | PASS | — |
| post-03 | post | no_metrics | PASS | — |
| post-04 | post | technical | PASS | — |
| tailor-01 | tailor | positive | PASS | — |
| tailor-02 | tailor | mismatch | PASS | — |
| gap-01 | gap | positive | PASS | — |
