# Privacy

CVs and achievements contain personal data. Wasl v2 minimises what leaves the platform and restricts which AI
providers may receive career data at all.

## 1. Redaction at the provider boundary

`app/security/pii.py` (`Redactor`) is applied **centrally** in `app/ai/router.py::run_structured`, so no workflow
can forget it. For every AI request:

1. All outbound messages (system + user prompt, and the repair round-trip) are redacted with one per-request
   `Redactor`. Values are replaced by stable placeholders such as `[EMAIL_1]`, `[PHONE_2]`, `[NAME_1]`.
2. The model is told to copy placeholders where those values belong.
3. The model's answer is restored **locally** (`restore`) before validation, so a parsed CV still contains the
   user's real email for their own review. The placeholder mapping exists only in process memory for that
   request — it is never sent, logged or stored.

| Replaced | Formats |
|---|---|
| `EMAIL` | any address |
| `PHONE` | `+966 5x…`, `05x…`, `00…`, Arabic-Indic digits, labelled phone/mobile/هاتف/جوال numbers |
| `NATIONAL_ID` | 10-digit Saudi ID/Iqama starting 1/2; labelled ID/الهوية/الإقامة values |
| `PASSPORT` | labelled passport numbers (Passport / جواز السفر) |
| `IBAN`, `CARD` | IBANs; Luhn-valid 13–19 digit card numbers |
| `PROFILE_URL` | LinkedIn, GitHub, GitLab, X/Twitter, Facebook, Instagram, Telegram, WhatsApp, Behance, Medium |
| `ADDRESS` | labelled addresses (Address/العنوان), P.O. boxes (ص.ب), street lines |
| `SECRET` | API keys and provider tokens by prefix (`sk-`/`sk_live_`, `gsk_`, `AIza…`, `ghp_`/`github_pat_`, `glpat-`, `xox[bpa]-`, `xapp-`, `AKIA`/`ASIA…`, `hf_`, `npm_`, `SG.`, `whsec_`, `ya29.`, `dop_v1_`, `shpat_`, Telegram `id:AA…`), bearer tokens, JWTs; webhook URLs (Slack `hooks.slack.com/services|workflows|triggers`, Discord, Teams/Office 365, and any `/webhook(s)/` or `/hook(s)/` path carrying a ≥ 20-char token); passwords in `scheme://user:password@host` (host kept); PEM private-key blocks; labelled `secret=`/`password:`/`api_key:` values that look generated (placeholders such as `<your-key>`, `${VAR}` and prose such as "rotated every 90 days" are kept); unlabelled high-entropy tokens ≥ 32 chars with upper, lower and ≥ 3 digits (hex digests, UUIDs, git SHAs, paths and camelCase identifiers are kept) |
| `NAME` | the account holder's name, labelled `Name:`/`الاسم:` values, and the first line of an uploaded CV (the first field when separated by `\|`, `,`, `·`, `•`, ` - `, `–` or `—`) |

Kept on purpose: employers, schools, titles, skills, project names, dates and metrics — the tasks need them
and claim verification checks against them.

Verification: `tests/test_security.py` captures the exact payload sent to the provider during a CV upload and
asserts that none of the name, email, phone (Latin and Arabic digits), ID, passport, profile or address strings
appear, while employer and skills do; 14 format tests and 6 must-keep tests cover the detector; the deterministic
evaluation reports `pii_recall` and `pii_preservation`. `tests/test_sensitive_data.py` (R-08) adds 28 secret
formats, 13 must-keep false-positive guards, header-separator cases, a log-scrub test and a payload-capture test that
pastes a webhook URL, a URL password and a labelled secret into a post request and asserts none reaches the
provider. Known limits: secret detection is pattern- and entropy-based, so a short or low-entropy password with no
label (e.g. "hunter2" in prose) is not detected, and a 32+ character random token made only of lowercase letters and
digits is kept; names of *other* people (references,
colleagues) are not detected unless labelled; free-form addresses without a label or street keyword can be missed.

## 2. Logs, monitoring and alerts

* `ai_events` store metadata only (task, provider, model ids, tokens, latency, error class, count of redactions).
* Error messages pass through `scrub()` → secret patterns + `redact_for_logs()` before `error_logs`.
* Quality events store counts and status codes, never claim text.
* Alert payloads contain rule keys, numbers, thresholds and sample sizes only (asserted in tests).

## 3. Provider privacy policy

Each task in the model registry has a sensitivity: `personal` (CV, achievements, posts, tailoring, roadmap, job
profile) or `public` (requirements extracted from public job ads). Personal tasks may only use a provider whose
**verifiable** privacy level is at least `AI_PERSONAL_MIN_PRIVACY` (default `limited_retention`). The rule applies
to the primary provider, every fallback, and BYOK keys. If no provider qualifies, the request fails with a safe
message and **nothing is sent** (`test_personal_task_blocked_when_no_provider_meets_privacy`).

Provider facts below were checked against official documentation on 2026-11-24.

| Provider / configuration | Level used by Wasl | Basis |
|---|---|---|
| Groq (default) | `limited_retention` | Inputs/outputs are not retained by default; may be logged up to 30 days for reliability/abuse investigation ([Your data](https://console.groq.com/docs/your-data)). Training use is not addressed on that page. |
| Groq with `GROQ_ZDR_ENABLED=true` | `zdr` | Any customer can enable Zero Data Retention in Data Controls. Wasl cannot detect this via API, so it is an operator attestation. |
| Gemini, unpaid tier (and BYOK Gemini keys, tier unknown) | `none` → **not eligible** for personal data | Free-tier content is used to improve Google products and may be read by human reviewers ([Gemini API terms](https://ai.google.dev/gemini-api/terms)). No zero-retention option was found for the Developer API. |
| Gemini with `GEMINI_PAID_TIER=true` (platform key) | `limited_retention` | Paid tier: prompts/responses not used to improve products; logged for a limited period for abuse detection. |
| OpenRouter | `zdr` | Wasl sends `provider: {"zdr": true, "data_collection": "deny"}` on personal tasks, so the request is routed only to ZDR endpoints or fails ([provider routing](https://openrouter.ai/docs/features/provider-routing)). OpenRouter itself does not store prompts unless you opt in. |

Wasl does **not** claim zero retention for any provider unless the configuration above is in place.

## 4. User controls

* BYOK keys are validated, encrypted at rest, never returned (only a hint), and deletable.
* `allow_platform_fallback` / `allow_cross_provider` limit where a user's data may go.
* `DELETE /api/auth/me` deletes the account and all owned rows (cascade); the Settings page exposes it with a
  typed confirmation.
* Uploaded originals are stored privately (local disk or a private Supabase bucket with per-user folders).
