# Setup & configuration

Every variable is listed (with comments) in `backend/.env.example` and `frontend/.env.example`.
**Never commit `.env` / `.env.local` and never paste keys into chats or issues.**

## 1. Local run

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -c "import secrets;print(secrets.token_urlsafe(48))"                               # -> JWT_SECRET
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"   # -> ENCRYPTION_KEY
uvicorn app.main:app --reload --port 8000
python -m scripts.seed_demo       # optional: local demo account + sample CV

cd ../frontend
npm install
cp .env.example .env.local
npm run dev                       # http://localhost:3000
```

If you change ports, keep `FRONTEND_URL`, `CORS_ORIGINS`, the OAuth redirect URIs (backend) and `NEXT_PUBLIC_API_URL` (frontend) consistent.

## 2. AI providers (required for AI features — free tiers are enough)

| Provider | Get a key | `.env` |
|---|---|---|
| Groq | https://console.groq.com/keys | `GROQ_API_KEY` |
| Google Gemini | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| OpenRouter (optional) | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |

Order and models: `AI_PROVIDER_PRIORITY`, `GROQ_MODEL_*`, `GEMINI_MODEL_*` (see `docs/AI_MODEL_REGISTRY.md`). With two
providers configured the router can fall back. Check as an admin: `GET /api/admin/health` → `ai_providers_configured`
(the public `/api/health` only returns `{"status":"ok"}`).

**Privacy policy (v2).** Tasks with personal data only go to providers meeting `AI_PERSONAL_MIN_PRIVACY`
(`limited_retention` by default). The Gemini **free tier is not eligible** (Google may use free-tier content to
improve products), so set `GEMINI_PAID_TIER=true` only if the Gemini project has billing enabled, and
`GROQ_ZDR_ENABLED=true` only after enabling Zero Data Retention in the Groq console. See `docs/PRIVACY.md`.

Users can also add their own keys in **Settings → AI provider & your own keys**; they are validated with the provider and stored encrypted.

## 3. Supabase (production database, auth, storage)

1. Create a project at https://supabase.com/dashboard.
2. SQL editor → run `supabase/migrations/0001_init.sql`, `0002_jobs.sql`, then **`0003_v2_security.sql`** (admin role +
   role-escalation triggers, audit log, alert incidents, traceability columns). All three are idempotent and additive.
   Local SQLite databases are upgraded automatically on startup (`app/migrate.py`).
3. Backend `.env`:
   * `DATABASE_URL=postgresql+psycopg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres` (Project → Connect → Session pooler)
   * `AUTH_MODE=supabase`, `SUPABASE_URL=https://<ref>.supabase.co`
   * `SUPABASE_JWT_SECRET` only for legacy HS256 projects (new projects are verified via JWKS automatically)
   * `SUPABASE_SERVICE_ROLE_KEY` (server only — used for Storage uploads)
4. Frontend `.env.local`: `NEXT_PUBLIC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design; RLS protects data).
5. Authentication → URL configuration: add your frontend URL as Site URL / redirect URL.

## 4. LinkedIn publishing

1. https://www.linkedin.com/developers/apps → *Create app* (needs a LinkedIn Page; any page you admin works).
2. *Products*: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. *Auth*: add redirect URL `http://localhost:8000/api/integrations/linkedin/callback` (or your deployed backend URL).
4. Copy Client ID / Secret → `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`. Scopes default to `openid profile email w_member_social`.
5. Restart backend → Settings → LinkedIn → Connect.

Wasl publishes only after the user confirms in a dialog. Access tokens last ~60 days; expiry is detected and the user is asked to reconnect.
If LinkedIn rejects the configured `LINKEDIN_API_VERSION`, the service falls back to the UGC Posts API.

## 5. GitHub achievement discovery

1. https://github.com/settings/developers → *New OAuth App*.
2. Callback URL: `http://localhost:8000/api/integrations/github/callback`.
3. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Default scope `read:user` (public repos). Add `repo` only if private repositories are needed (broad scope).
4. Scans are manual, limited to `GITHUB_MAX_REPOS_PER_SCAN` selected repos, and unchanged repos are skipped.

## 6. Administrators, alerts

```bash
cd backend
python -m scripts.admin grant you@example.com --reason "owner"   # the account must already exist
python -m scripts.run_alerts                                     # one alert cycle (for cron)
```

| Variable | Default | Purpose |
|---|---|---|
| `ALERT_SLACK_WEBHOOK_URL` / `ALERT_WEBHOOK_URL` | empty | External alert delivery (empty = persisted only) |
| `ALERT_EVAL_INTERVAL_MINUTES` | 5 | In-process alert scheduler; 0 = disabled (use cron) |
| `ALERT_MIN_SAMPLE`, `ALERT_COOLDOWN_MINUTES`, `ALERT_*` thresholds | see `config.py` | Rule tuning (`docs/MONITORING.md`) |
| `AI_TOTAL_DEADLINE_SECONDS` | 120 | Cap on one logical AI request incl. retries/fallbacks |
| `AI_PERSONAL_MIN_PRIVACY` | `limited_retention` | `none` / `limited_retention` / `zdr` |
| `GROQ_ZDR_ENABLED`, `GEMINI_PAID_TIER` | false | Operator attestations about provider accounts |
| `AI_REDACT_PII` | true | Never disable in production |
| `API_URL_INTERNAL` (frontend, server-only) | `NEXT_PUBLIC_API_URL` | Backend URL used by the `/admin` proxy |

## 7. Tests & checks

```bash
cd backend  && pytest -q && ruff check app tests scripts
cd backend  && python -m app.eval_v2                          # deterministic AI regression suite (no LLM)
cd frontend && npm run lint && npm run build && npx tsc --noEmit
cd backend  && python -m app.evaluation --max-calls 60        # LIVE providers, needs keys, bounded
cd backend  && python -m app.evaluation --benchmark --max-calls 90
```

## 8. Production checklist

`APP_ENV=production` (startup refuses missing `JWT_SECRET` / `ENCRYPTION_KEY`) · HTTPS for both apps · `CORS_ORIGINS` = real frontend origin ·
OAuth redirect URIs updated · Supabase migrations 0001–0003 applied · keep `AI_ENABLE_FAKE_PROVIDER=false` ·
at least one privacy-eligible provider for personal tasks · an admin provisioned with `scripts.admin` ·
an alert channel configured.
