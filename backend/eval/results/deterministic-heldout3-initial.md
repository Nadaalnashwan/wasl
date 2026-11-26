# Wasl deterministic evaluation — wasl-heldout-3.0

Verifier: `claims-v2.2` · Commit: `6e142f2` · Run: 2026-11-25T23:18:22.116341+00:00

No AI provider is called: each case runs a fixed adversarial input through the production verification, enforcement and redaction code. These are NOT live model-quality numbers.

| Metric | Value |
|---|---|
| cases | 62 |
| errors | 0 |
| case_pass_rate | 0.7097 |
| ai_quality_case_pass_rate | 0.7097 |
| claim_detection_precision | 1.0 |
| claim_detection_recall | 0.6316 |
| claim_detection_f1 | 0.7742 |
| false_acceptance_rate | 0.3684 |
| false_rejection_rate | 0.0 |
| tailor_post_enforcement_unsupported | 0 |
| tailor_raw_unsupported_claims | 0 |
| tailor_claims_checked | 0 |
| injection_detection_accuracy | 0.6429 |
| pii_recall | 0.7368 |
| pii_preservation | 1.0 |
| injection_precision | 1.0 |
| injection_recall | 0.4444 |
| claim_confusion | tp=12, fn=7, fp=0, tn=5, n=24 |
| injection_confusion | tp=4, fn=5, fp=0, tn=5, n=14 |
| pii_strings | must_remove=19, false_negatives=5, must_keep=39, false_positives=0 |

## By category

| Category | Passed | Cases | Pass rate |
|---|---|---|---|
| claims | 17 | 24 | 0.7083 |
| injection | 8 | 14 | 0.5714 |
| pii | 19 | 24 | 0.7917 |

## By language

| Language | Passed | Cases | Pass rate |
|---|---|---|---|
| ar | 5 | 8 | 0.625 |
| en | 38 | 53 | 0.717 |
| mixed | 1 | 1 | 1.0 |

## Failed cases (18)

| Case | Category | Failed checks / error |
|---|---|---|
| h3-c02 | claims | passed_matches, flags_1:Employee of the Year |
| h3-c03 | claims | passed_matches, flags_1:rebuilt |
| h3-c04 | claims | passed_matches, flags_1:Trained |
| h3-c05 | claims | passed_matches, flags_1:لوحة التحكم |
| h3-c09 | claims | passed_matches, flags_1:200 |
| h3-c14 | claims | passed_matches, flags_1:Managed |
| h3-c24 | claims | passed_matches, flags_1:proposed |
| h3-i03 | injection | flagged |
| h3-i04 | injection | flagged |
| h3-i05 | injection | flagged |
| h3-i10 | injection | kept:def parse(rows) |
| h3-i13 | injection | flagged |
| h3-i14 | injection | flagged |
| h3-p03 | pii | removed:FAKEaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789 |
| h3-p04 | pii | removed:FAKEabcdef0123456789 |
| h3-p07 | pii | removed:9fJ2kLq8Zx7Vb3Nm1Pr6Ts4Wy0Hc5UeFAKE |
| h3-p09 | pii | removed:MIIEowIBAAKCAQEAFAKEkeyMaterial0123456789abcdefABCDEF |
| h3-p23 | pii | removed:AAFAKEexampleTokenValue_abcdefghij12345 |
