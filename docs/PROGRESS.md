# Implementation status — updated 2026-10-20 (evening)

Legend: ✅ done & verified · 🟡 implemented, verification blocked on credentials · ⏳ not done

## Acceptance criteria

| # | Feature | Acceptance criterion | Status | Evidence |
|---|---|---|---|---|
| 1 | Auth | register/login/me; other users' rows return 404 | ✅ | `test_auth_and_isolation`, browser login |
| 2 | Achievements (manual) | saved as confirmed; duplicates → 409 with "save anyway" | ✅ | `test_cv_update_accept_edit_reject`, browser |
| 3 | Achievement extraction | candidates saved *pending*; quotes verified; unsupported terms dropped; injection flagged | ✅ fake + real LLM | `test_extraction_verifies_evidence_and_requires_confirmation` |
| 4 | Contribution confirmation | repo/team items cannot be confirmed without a contribution note | ✅ | API rule + UI disabled state |
| 5 | Auto CV draft | confirming creates a *separate* suggestion; Master CV unchanged until Accept | ✅ | journey test |
| 6 | Accept / Edit / Reject | each path updates status, version, history; stale drafts refused | ✅ | `test_cv_update_accept_edit_reject`, `test_edit_then_accept_and_stale` |
| 7 | CV upload & parse | PDF/DOCX/TXT validated (type, magic bytes, 5 MB); parsed result reviewed before saving | ✅ validation / 🟡 parsing not yet run with a real CV file | `test_upload_rejects_bad_files` |
| 8 | CV export | PDF and DOCX, incl. Arabic | ✅ | `test_exports_produce_valid_files` |
| 9 | Post generation | draft saved with claim check; edit; copy; drafts list | ✅ fake + real LLM | `test_post_generation_and_publish_guards` |
| 10 | LinkedIn publish | requires confirmation; unconnected → 412, never fake success; lock prevents duplicates | ✅ guards / 🟡 live publish (needs redirect URL in LinkedIn app) | journey test, Settings shows "unavailable" |
| 11 | CV tailoring | requirements → explainable score → tailored CV saved; invented bullets rejected; skills unchanged | ✅ fake + real LLM | `test_tailor_never_invents` |
| 12 | Gap analysis | verified / unverified / missing + roadmap | ✅ fake + real LLM | `test_gap_analysis` |
| 13 | GitHub discovery | OAuth, repo list with new/updated state, selected scan, max per scan | 🟡 | credentials valid; needs callback URL update in GitHub app |
| 14 | AI router | retry on transient, fallback on auth, JSON repair, helpful error, BYOK rules, no-provider recorded | ✅ | 6 router tests |
| 15 | BYOK | key validated before save, encrypted, only hint returned, delete | ✅ (fake provider) | `test_byok_key_validation` |
| 16 | Monitoring | metrics computed from real events; scope all/mine; alerts | ✅ | `test_monitoring_reflects_real_events`, browser |
| 17 | Evaluation | dataset + runner storing results | ✅ 17/17 real run | needs a provider key |
| 18 | UI | 9 pages, EN/AR RTL, paper/blueprint themes, responsive, empty & error states | ✅ | browser walk-through (both languages, both themes) |
| 19 | Supabase | migration with RLS + storage; Supabase JWT verification | 🟡 | needs a Supabase project |

## Latest test results (2026-10-20)

* Backend: `pytest` **23 passed**; `ruff check` clean.
* Frontend: `tsc --noEmit` clean; `eslint` clean; `next build` succeeds (15 routes).
* Browser: landing, register/login, dashboard, discovery, studio, CV, tailoring, gap, monitoring, settings — rendered without runtime errors;
  AI-unavailable state, manual achievement save, Arabic RTL verified.

## Configured integrations (2026-10-20)

| Integration | Configured | Tested |
|---|---|---|
| Groq | ✅ | ✅ list models + structured calls (primary, < 1 s) |
| Gemini | ✅ | ✅ list models + structured calls (fallback, 8–17 s) |
| Router fallback | ✅ | ✅ invalid Groq key → `auth` → Gemini |
| GitHub OAuth app | ✅ | ✅ client credentials valid · ⏳ callback URL must be set to `http://localhost:8000/api/integrations/github/callback` |
| LinkedIn app | ✅ | ⏳ LinkedIn reports redirect mismatch — add `http://localhost:8000/api/integrations/linkedin/callback` |
| Supabase | values stored | reachable (auth settings + JWKS 200) · app still on local SQLite (migration + DB password not set up) |

## Blockers (need the project owner)

1. Update OAuth callback URLs in the LinkedIn and GitHub developer consoles (above), then Connect from Settings.
2. Optional Supabase switch: run the migration, add `DATABASE_URL`, set `AUTH_MODE=supabase`.
3. Rotate keys after the presentation (they were shared in a chat transcript).

## Remaining work

* Re-run the evaluation before the presentation and compare.
* Live verification of LinkedIn / GitHub / Supabase once credentials exist.
* Nice-to-have: push alerts to email/Slack, OCR for scanned certificates, larger eval set, LLM-as-judge for paraphrased claims.
