# Security

## Authorization model

| Layer | Enforced by | Notes |
|---|---|---|
| Authentication | `app/security/auth.py` (`get_current_user`) | Local HS256 JWTs or Supabase access tokens (JWKS / legacy HS256). |
| Authorization | **backend code**: `app/security/authz.py` (`require_admin`) and `app/deps.py` (`owned()`) | The backend's direct SQLAlchemy connection can bypass Supabase RLS, so every rule that matters is enforced in Python. |
| Row Level Security | `supabase/migrations/0001–0003` | Defence in depth for the public `anon` / `authenticated` keys only. |
| Admin console shell | `frontend/src/proxy.ts` + `/api/admin-session` | Server-side gate before `/admin/*` renders; the data itself is still authorised by the backend. |

### Roles

`users.role` is `user` (default for every new account, local or Supabase) or `admin`.

* The role is read from the database on **every request**. It is never taken from a JWT claim, Supabase
  `user_metadata`/`app_metadata`, a query parameter, local storage or an email allow-list. Revoking an admin takes
  effect on their next request (`test_revoked_admin_loses_access_immediately`).
* No API endpoint can change a role. `PATCH /api/auth/me` uses `extra="forbid"`, so a forged `"role"` field is
  rejected with 422 (`test_user_cannot_modify_own_role`).
* On Supabase, migration `0003_v2_security.sql` revokes `UPDATE (role)` from `anon`/`authenticated` and adds two
  triggers: role changes from client connections raise an error, and client inserts are forced to `role='user'`.

### Provisioning administrators

The person registers normally first; then an operator with server access runs (from `backend/`):

```bash
python -m scripts.admin grant someone@example.com --reason "on-call engineer"
python -m scripts.admin revoke someone@example.com --reason "left the team"
python -m scripts.admin list
```

Every change is written to `admin_audit_log` (`role_grant` / `role_revoke`, operator, reason). The script never
creates passwords. No admin account, email or credential is committed to this (public) repository.

### Admin API

Every route under `/api/admin/*` declares `dependencies=[Depends(require_admin)]`:

| Caller | Result |
|---|---|
| Anonymous | **401** |
| Authenticated, role `user` | **403** (and an `admin_denied` audit row) |
| Authenticated, role `admin` | 200 (and an `admin_access` audit row with the route template only) |

The deprecated v1 endpoints `/api/monitoring/*` (which let any user read deployment-wide metrics with
`scope=all`) now require `admin` too, as does `GET /api/jobs/usage`. `GET /api/health` is minimal
(`{"status":"ok"}`); configuration details moved to `/api/admin/health`.

### Admin console gate (frontend)

1. After sign-in, an admin's browser posts its bearer token to the Next route handler `/api/admin-session`.
2. The handler asks the backend `GET /api/admin/whoami`; only on 200 does it set an **HttpOnly, SameSite=Strict,
   Secure (production)** cookie. Cross-origin posts are rejected.
3. `proxy.ts` runs before every `/admin/*` request, re-verifies the cookie with the backend, and redirects to
   `/admin-gate` on 401/403 (deleting the cookie). Responses carry `Cache-Control: private, no-store`.
4. Admin pages fetch data client-side with the user's token; nothing admin-specific is statically generated.

Next.js was upgraded from 16.4.2 to **16.4.6** because `npm audit` reported moderate advisories in 16.0.0–16.4.4,
including HttpOnly-cookie exposure on Edge routes (GHSA-f3mh-rxg3-f5g2). `npm audit --omit=dev` is clean.

## Ownership (IDOR)

User-owned rows are fetched with `owned(db, Model, id, user)` (404 for other users' ids — existence is not
leaked) or with queries filtered by `user_id`. v2 closed the remaining indirect lookups:

* `PATCH /api/posts/{id}`: the linked achievement is re-checked to belong to the user before re-verifying claims.
* `GET /api/career/analyses/{id}`: the tailored CV's parent CV must belong to the user.
* CV suggestion review: the suggestion's CV must belong to the user.
* `PUT /api/cv/master` accepts `base_version`; a stale editor gets 409 instead of overwriting newer content.

`tests/test_security.py` covers cross-user CV read/export/restore, achievement edit/confirm/delete, post
edit/publish/delete and analysis listing.

## Database changes

All schema changes are additive. `app/migrate.py` adds missing v2 columns to existing databases (SQLite or
Postgres) on startup because `create_all()` never alters existing tables; the Supabase equivalent is
`0003_v2_security.sql`. `test_migration_upgrades_v1_schema_without_data_loss` upgrades a v1-shaped database and
checks that existing users keep their data and are **not** promoted.

## Secrets review (2026-11-24)

Tracked files and full git history were scanned for Groq, Gemini, OpenRouter, GitHub, JWT and Postgres-URL
patterns. Only placeholders (`<ref>`, `[YOUR-PASSWORD]`) and a deliberately fake token in
`tests/test_security.py` matched. No rotation is required based on this scan. Platform keys stay in backend
environment variables; BYOK keys and OAuth tokens are Fernet-encrypted at rest and never returned by the API.
