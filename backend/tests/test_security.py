"""Security regression suite: admin authorization matrix, IDOR, role escalation, PII at the provider boundary,
privacy policy, schema migration and alerting. Software-security tests — kept separate from AI-quality metrics."""
from __future__ import annotations

import copy
import json

import pytest
from sqlalchemy import create_engine, inspect, text

from app.ai.claims import check_claims
from app.ai.providers.fake import FakeProvider
from app.ai.router import AIUnavailableError, Candidate, run_structured
from app.ai.schemas import CVData, GeneratedPost
from app.config import settings
from app.db import SessionLocal
from app.migrate import upgrade
from app.models import AdminAuditLog, AlertIncident
from app.monitoring import alerts
from app.security.pii import Redactor, contains_pii
from scripts.admin import set_role
from tests.conftest import SAMPLE_CV, default_responder, make_admin

ADMIN_ROUTES = [
    ("get", "/api/admin/whoami"), ("get", "/api/admin/health"), ("get", "/api/admin/monitoring/metrics"),
    ("get", "/api/admin/monitoring/errors"), ("get", "/api/admin/monitoring/evals"), ("get", "/api/admin/monitoring/models"),
    ("get", "/api/admin/monitoring/alerts"), ("post", "/api/admin/monitoring/alerts/evaluate"), ("get", "/api/admin/audit"),
    ("get", "/api/admin/monitoring/quality-events"), ("post", "/api/admin/monitoring/alerts/test"),
    # deprecated v1 endpoints must not bypass the new protection
    ("get", "/api/monitoring/metrics"), ("get", "/api/monitoring/metrics?scope=all"), ("get", "/api/monitoring/evals"),
    ("get", "/api/jobs/usage"),
]


def _user(client, email):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123", "full_name": "Plain User"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ------------------------------------------------------------------ authorization matrix
@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_anonymous_gets_401_on_admin_routes(client, method, path):
    assert getattr(client, method)(path).status_code == 401


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
def test_normal_user_gets_403_on_admin_routes(client, auth, method, path):
    assert getattr(client, method)(path, headers=auth).status_code == 403


def test_admin_allowed_and_access_is_audited(client, admin_auth):
    for method, path in ADMIN_ROUTES:
        r = getattr(client, method)(path, headers=admin_auth)
        # alert test returns 412 when no channel is configured (still authorised)
        assert r.status_code in (200, 412), (path, r.status_code, r.text)
    db = SessionLocal()
    try:
        assert db.query(AdminAuditLog).filter(AdminAuditLog.action == "admin_access").count() >= len(ADMIN_ROUTES) - 1
    finally:
        db.close()


def test_new_users_default_to_user_role(client, auth):
    assert client.get("/api/auth/me", headers=auth).json()["role"] == "user"


def test_user_cannot_modify_own_role(client, auth):
    r = client.patch("/api/auth/me", json={"role": "admin"}, headers=auth)
    assert r.status_code == 422  # unknown field rejected, never applied
    assert client.get("/api/auth/me", headers=auth).json()["role"] == "user"
    assert client.get("/api/admin/whoami", headers=auth).status_code == 403


def test_forged_admin_claim_in_token_is_ignored(client, auth):
    import jwt

    me = client.get("/api/auth/me", headers=auth).json()
    forged = jwt.encode({"sub": me["id"], "role": "admin", "app_metadata": {"role": "admin"}, "iss": "wasl",
                         "exp": 4102444800}, settings.jwt_secret, algorithm="HS256")
    # even a validly-signed token claiming admin is not trusted: the role comes from the database
    assert client.get("/api/admin/whoami", headers={"Authorization": f"Bearer {forged}"}).status_code == 403
    bad = jwt.encode({"sub": me["id"], "role": "admin", "iss": "wasl", "exp": 4102444800}, "attacker-secret-attacker-secret-1", algorithm="HS256")
    assert client.get("/api/admin/whoami", headers={"Authorization": f"Bearer {bad}"}).status_code == 401


def test_revoked_admin_loses_access_immediately(client):
    h = make_admin(client, "revoke-me@test.dev")
    assert client.get("/api/admin/whoami", headers=h).status_code == 200
    assert set_role("revoke-me@test.dev", "user", "test revoke") == 0
    assert client.get("/api/admin/whoami", headers=h).status_code == 403  # same token, next request
    db = SessionLocal()
    try:
        assert db.query(AdminAuditLog).filter(AdminAuditLog.action == "role_revoke").count() >= 1
    finally:
        db.close()


def test_public_health_leaks_no_configuration(client):
    assert client.get("/api/health").json() == {"status": "ok"}


# ------------------------------------------------------------------ cross-user access (IDOR)
def test_cross_user_cv_achievement_and_export_denied(client, auth):
    client.put("/api/cv/master", json={"data": copy.deepcopy(SAMPLE_CV), "change_summary": "init"}, headers=auth)
    cv_id = client.get("/api/cv/master", headers=auth).json()["id"]
    aid = client.post("/api/achievements?auto_cv_update=false", json={"title": "Private project", "description": "Built a private tool in Python.",
                                                                       "category": "project"}, headers=auth).json()["achievement"]["id"]
    b = _user(client, "user-b-idor@test.dev")
    assert client.get(f"/api/cv/{cv_id}/export?format=pdf", headers=b).status_code == 404
    assert client.get(f"/api/cv/{cv_id}/export?format=docx", headers=b).status_code == 404
    assert client.delete(f"/api/cv/tailored/{cv_id}", headers=b).status_code == 404
    assert client.patch(f"/api/achievements/{aid}", json={"title": "pwned"}, headers=b).status_code == 404
    assert client.post(f"/api/achievements/{aid}/confirm", json={}, headers=b).status_code in (404, 422)
    assert client.delete(f"/api/achievements/{aid}", headers=b).status_code == 404
    assert client.get("/api/cv/master", headers=b).json() is None
    assert client.get("/api/cv/versions", headers=b).json() == []
    assert client.post("/api/cv/versions/1/restore", headers=b).status_code == 404
    # B's own suggestion ids cannot touch A's CV and A's analyses are invisible
    assert client.get("/api/career/analyses", headers=b).json() == []


def test_cross_user_posts_denied(client, auth):
    p = client.post("/api/posts/generate", json={"text": "Built an AI resume parser with Python and FastAPI for students."}, headers=auth)
    assert p.status_code == 201, p.text
    pid = p.json()["id"]
    b = _user(client, "user-b-posts@test.dev")
    assert client.patch(f"/api/posts/{pid}", json={"content": "hijacked"}, headers=b).status_code == 404
    assert client.post(f"/api/posts/{pid}/publish", json={"confirm": True}, headers=b).status_code == 404
    assert client.delete(f"/api/posts/{pid}", headers=b).status_code == 404


# ------------------------------------------------------------------ PII never leaves for the provider
PII_CV = """Sara Ali Alharbi
Riyadh | sara.alharbi@example.com | +966 55 123 4567 | linkedin.com/in/sara-alharbi
الجوال: ٠٥٥١٢٣٤٥٦٧  رقم الهوية: 1098765432  Passport No: A12345678
Address: 12 King Fahd Road, Al Olaya
Experience
Backend Developer, Acme (2019 - 2023): Built REST APIs in Python for 10,000 users.
"""
SECRETS = ["sara.alharbi@example.com", "123 4567", "0551234567", "٠٥٥١٢٣٤٥٦٧", "1098765432", "A12345678", "sara-alharbi",
           "King Fahd Road", "Sara Ali Alharbi"]


def test_cv_upload_outbound_payload_has_no_pii(client, auth, fake_llm):
    seen: list[str] = []

    def capture(messages):
        seen.append("\n".join(m.content for m in messages))
        return json.dumps({"contact": {"full_name": "[NAME_1]", "email": "[EMAIL_1]", "phone": "[PHONE_1]"},
                           "summary": "Backend developer.", "experience": [{"title": "Backend Developer", "organization": "Acme",
                                                                           "bullets": ["Built REST APIs in Python for 10,000 users."]}],
                           "skills": ["Python"]})

    fake_llm.responder = staticmethod(capture)
    r = client.post("/api/cv/upload", files={"file": ("cv.txt", PII_CV.encode(), "text/plain")}, headers=auth)
    assert r.status_code == 200, r.text
    outbound = "\n".join(seen)
    for s in SECRETS:
        assert s not in outbound, f"PII leaked to provider: {s}"
    assert "Acme" in outbound and "Python" in outbound  # task-relevant content is kept
    contact = r.json()["parsed"]["contact"]
    # placeholders restored locally for the user's own review
    assert contact["email"] == "sara.alharbi@example.com" and contact["full_name"] == "Sara Ali Alharbi"


def test_post_generation_redacts_users_name(client, fake_llm):
    h = client.post("/api/auth/register", json={"email": "named@test.dev", "password": "password123", "full_name": "Noura Alqahtani"}).json()
    h = {"Authorization": f"Bearer {h['access_token']}"}
    seen: list[str] = []

    def capture(messages):
        seen.append("\n".join(m.content for m in messages))
        return default_responder(messages)

    fake_llm.responder = staticmethod(capture)
    r = client.post("/api/posts/generate", json={"text": "Noura Alqahtani built an AI resume parser with Python and FastAPI; call 0551234567."}, headers=h)
    assert r.status_code == 201, r.text
    assert "Noura Alqahtani" not in "\n".join(seen) and "0551234567" not in "\n".join(seen)


def test_pii_never_written_to_monitoring_tables(client, auth):
    from app.monitoring.recorder import record_error

    record_error("/api/cv/upload", RuntimeError("boom sara.alharbi@example.com 0551234567 token gsk_abcdefghijklmnopqrstuvwx"))
    client.post("/api/cv/upload", files={"file": ("cv.txt", PII_CV.encode(), "text/plain")}, headers=auth)
    db = SessionLocal()
    try:
        rows = db.execute(text("select message from error_logs")).all() + db.execute(text("select details from quality_events")).all()
        blob = json.dumps([str(r[0]) for r in rows])
        assert "sara.alharbi@example.com" not in blob and "0551234567" not in blob
    finally:
        db.close()


@pytest.mark.parametrize("sample,kind", [
    ("mail me: a.b+c@uni.edu.sa", "EMAIL"), ("+966 50 000 1234", "PHONE"), ("جوال ٠٥٠٠٠٠١٢٣٤", "PHONE"), ("0096650001234", "PHONE"),
    ("رقم الهوية: 1012345678", "NATIONAL_ID"), ("Iqama 2123456789", "NATIONAL_ID"), ("Passport No. K1234567", "PASSPORT"),
    ("IBAN SA0380000000608010167519", "IBAN"), ("card 4111 1111 1111 1111", "CARD"), ("github.com/someone", "PROFILE_URL"),
    ("العنوان: حي الملقا، الرياض", "ADDRESS"), ("P.O. Box 12345", "ADDRESS"), ("key gsk_abcdefghijklmnopqrstuvwxyz0123", "SECRET"),
    ("الاسم: محمد العتيبي", "NAME"),
])
def test_pii_detector_covers_formats(sample, kind):
    assert kind in contains_pii(sample)


@pytest.mark.parametrize("keep", [
    "Reduced latency by 40% for 10,000 users between 2019 and 2023.", "Python, FastAPI, PostgreSQL, Docker",
    "Backend Developer at Acme", "Team of 20 engineers", "GPA 4.8/5", "Version 3.11",
])
def test_pii_detector_keeps_task_content(keep):
    assert Redactor().redact(keep) == keep


def test_redactor_round_trip():
    r = Redactor(known_names=["Sara Ali"])
    red = r.redact("Sara Ali — sara@example.com")
    assert "sara@example.com" not in red and r.restore(red) == "Sara Ali — sara@example.com"


# ------------------------------------------------------------------ provider privacy policy
FAKE = [Candidate("fake", "fake-platform-key", "platform")]


async def test_personal_task_blocked_when_no_provider_meets_privacy(monkeypatch):
    from app.ai import model_registry

    monkeypatch.setattr(model_registry, "provider_privacy", lambda p, k="platform": ("none", "test"))
    with pytest.raises(AIUnavailableError) as ei:
        await run_structured("cv_parse", "sys", "secret cv", CVData, candidates=FAKE)
    assert "privacy" in ei.value.reason
    assert FakeProvider.calls == 0  # nothing was sent


async def test_public_task_allowed_on_low_privacy_provider(monkeypatch):
    from app.ai import model_registry

    monkeypatch.setattr(model_registry, "provider_privacy", lambda p, k="platform": ("none", "test"))
    FakeProvider.responder = staticmethod(lambda m: json.dumps({"job_title": "X", "must_have": [], "nice_to_have": []}))
    from app.ai.schemas import JobRequirements

    res = await run_structured("job_requirements", "sys", "public job ad", JobRequirements, candidates=FAKE)
    assert res.provider == "fake"


def test_gemini_free_tier_not_eligible_for_personal_data():
    from app.ai.model_registry import privacy_ok, provider_privacy

    level, _ = provider_privacy("gemini", "platform")
    assert not privacy_ok(level, "personal") and privacy_ok(level, "public")
    level, _ = provider_privacy("gemini", "user")  # BYOK cannot bypass the policy
    assert not privacy_ok(level, "personal")
    assert privacy_ok(provider_privacy("openrouter")[0], "personal")
    assert privacy_ok(provider_privacy("groq")[0], "personal")


async def test_openrouter_requests_zdr_routing_for_personal_tasks(monkeypatch):
    import httpx

    from app.ai.providers.openai_compat import OpenRouterProvider

    captured = {}

    async def fake_post(self, url, json=None, headers=None):  # noqa: A002
        captured["body"] = json
        return httpx.Response(200, json={"model": "m", "choices": [{"message": {"content": '{"content":"x","hashtags":[],"facts_used":[]}'}}]},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    p = OpenRouterProvider("k")
    p.zdr_required = True
    from app.ai.providers.base import ChatMessage

    await p.complete([ChatMessage("user", "x")], "m", json_mode=True, temperature=0, max_tokens=10, timeout=5)
    assert captured["body"]["provider"] == {"zdr": True, "data_collection": "deny"}


async def test_router_records_model_and_cost_traceability():
    FakeProvider.responder = staticmethod(default_responder)
    res = await run_structured("post_generation", "LinkedIn writing assistant", "u", GeneratedPost, candidates=FAKE)
    db = SessionLocal()
    try:
        row = db.execute(text("select registry_version, returned_model, privacy_level from ai_events where request_id = :r"),
                         {"r": res.request_id}).first()
        assert row[0] and row[1] and row[2] == "zdr"
    finally:
        db.close()


# ------------------------------------------------------------------ schema migration (upgrade an existing v1 DB)
def test_migration_upgrades_v1_schema_without_data_loss(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'v1.db'}")
    with eng.begin() as c:
        c.execute(text("create table users (id varchar(36) primary key, email varchar(320), full_name varchar(200))"))
        c.execute(text("insert into users values ('u1', 'old@test.dev', 'Old User')"))
        c.execute(text("create table ai_events (id varchar(36) primary key, task varchar(40))"))
        c.execute(text("create table eval_runs (id varchar(36) primary key, dataset_version varchar(40))"))
    applied = upgrade(eng)
    assert "users.role" in applied and "ai_events.returned_model" in applied and "eval_runs.kind" in applied
    assert upgrade(eng) == []  # idempotent
    with eng.begin() as c:
        assert c.execute(text("select email, role from users")).first() == ("old@test.dev", "user")  # not promoted
    assert "role" in {col["name"] for col in inspect(eng).get_columns("users")}


# ------------------------------------------------------------------ alerting
async def test_alert_cycle_opens_dedupes_and_resolves(monkeypatch):
    fired = {"on": True}
    sent: list[dict] = []
    monkeypatch.setattr(alerts, "evaluate_rules", lambda m: [alerts._rule("critical", "test_rule", "Test", 1.0, 0.5, 50, "x")] if fired["on"] else [])
    monkeypatch.setattr(alerts, "_extra_rules", lambda db, now: [])
    monkeypatch.setattr(settings, "alert_webhook_url", "https://alerts.invalid/hook")

    async def fake_deliver(payload, attempts=3):
        sent.append(payload)
        return True, ""

    monkeypatch.setattr(alerts, "deliver", fake_deliver)
    db = SessionLocal()
    try:
        r1 = await alerts.run_cycle(db)
        r2 = await alerts.run_cycle(db)  # still firing: deduplicated, no second notification inside the cooldown
        assert r1["opened"] == ["test_rule"] and r2["opened"] == [] and len(sent) == 1
        fired["on"] = False
        r3 = await alerts.run_cycle(db)
        assert r3["resolved"] == ["test_rule"] and sent[-1]["status"] == "resolved"
        inc = db.query(AlertIncident).filter(AlertIncident.key == "test_rule").one()
        assert inc.status == "resolved" and inc.notify_status == "sent" and inc.recovery_notified
        # payloads carry metrics only — no user ids, emails or content
        assert all(set(p) <= {"text", "key", "severity", "status", "value", "threshold", "sample_size", "environment"} for p in sent)
    finally:
        db.close()


def test_alert_rules_ignore_tiny_samples_but_not_escapes():
    from app.monitoring.metrics import compute

    db = SessionLocal()
    try:
        m = compute(db, 1)
    finally:
        db.close()
    m["ai"].update(total_requests=3, failure_rate=1.0)
    keys = {a["key"] for a in alerts.evaluate_rules(m)}
    assert "ai_failure_rate" not in keys
    m["quality"]["unsupported_escaped"] = 1
    assert "claims_escaped" in {a["key"] for a in alerts.evaluate_rules(m)}


def test_unavailable_verifier_never_passes(monkeypatch):
    import app.ai.claims as claims

    monkeypatch.setattr(claims, "extract_atoms", lambda t: (_ for _ in ()).throw(RuntimeError("x")))
    r = claims.check_claims("Led 5 teams", "nothing")
    assert r["passed"] is False and r["summary"]["unavailable"] == 1


def test_publish_blocks_unverified_claims_without_acknowledgement(client, auth):
    a = client.post("/api/achievements?auto_cv_update=false", json={"title": "Parser", "description": "Built a parser in Python for 120 students.",
                                                                     "category": "project"}, headers=auth).json()["achievement"]
    p = client.post("/api/posts/generate", json={"achievement_id": a["id"]}, headers=auth).json()
    client.patch(f"/api/posts/{p['id']}", json={"content": "I led a team of 50 and earned an AWS certification."}, headers=auth)
    r = client.post(f"/api/posts/{p['id']}/publish", json={"confirm": True}, headers=auth)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "unverified_claims"
    assert check_claims("I led a team of 50.", "Built a parser in Python for 120 students.")["passed"] is False
