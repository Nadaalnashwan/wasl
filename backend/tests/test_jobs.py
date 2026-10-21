"""Job recommendations: normalization, extraction, scoring, and the full refresh → save → track journey.

Providers are replaced by in-memory fetchers (no network); the LLM is the deterministic fake from conftest.
"""
from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta

import pytest

from app.ai.workflows import jobs as wf
from app.config import settings
from app.services import job_sources as js
from tests.conftest import SAMPLE_CV

JSEARCH_ITEMS = [
    {"job_id": "js1", "job_title": "Backend Developer", "employer_name": "Nova Tech", "job_city": "الرياض", "job_country": "SA",
     "job_employment_types": ["FULLTIME"], "job_is_remote": False, "job_posted_at": "2 days ago",
     "job_apply_link": "https://jobs.example.com/nova-backend", "job_publisher": "LinkedIn",
     "job_description": "We need a backend developer.\nRequirements:\n- 2+ years of experience with Python and SQL\n- REST API design\n"
                        "Preferred:\n- Kubernetes\nBachelor's degree in Computer Science."},
    {"job_id": "js2", "job_title": "Head of Engineering", "employer_name": "BigCo", "job_city": "Jeddah", "job_country": "SA",
     "job_employment_types": ["FULLTIME"], "job_posted_at": "5 days ago", "job_apply_link": "https://jobs.example.com/head",
     "job_description": "Lead 40 engineers. 12+ years of experience. Python, Java, leadership."},
    {"job_id": "js3", "job_title": "Python Developer", "employer_name": "Gulf Soft", "job_city": "London", "job_country": "GB",
     "job_apply_link": "https://jobs.example.com/uk", "job_description": "Python role in the UK."},
]
SERP_ITEMS = [
    # same job as js1 (company suffix + city wording differ) -> must merge, not duplicate
    {"job_id": "sp1", "title": "Backend Developer", "company_name": "Nova Tech Company", "location": "Riyadh Saudi Arabia",
     "via": "via Bayt", "detected_extensions": {"posted_at": "1 day ago", "schedule_type": "Full-time"},
     "apply_options": [{"title": "Bayt", "link": "https://bayt.example.com/nova"}], "description": "Short ad."},
    {"job_id": "sp2", "title": "Data Analyst Intern", "company_name": "Aramco Digital", "location": "Dhahran",
     "detected_extensions": {"posted_at": "3 days ago", "schedule_type": "Internship"},
     "apply_options": [{"title": "Company site", "link": "https://careers.example.com/intern"}],
     "description": "Internship for students. SQL, Python and Power BI. Communication skills."},
]


@pytest.fixture
def providers(monkeypatch):
    calls = {"jsearch": 0, "serpapi": 0}
    fail = {"jsearch": False, "serpapi": False}

    def make(name, items):
        async def fetch(_client, q):
            calls[name] += 1
            if fail[name]:
                raise js.ProviderFailure("error", 500, f"{name} down")
            return copy.deepcopy(items)
        return fetch

    async def no_account(_client):
        return 100

    monkeypatch.setattr(settings, "jsearch_api_key", "test-jsearch")
    monkeypatch.setattr(settings, "serpapi_api_key", "test-serp")
    monkeypatch.setitem(js.FETCHERS, "jsearch", (make("jsearch", JSEARCH_ITEMS), js.normalize_jsearch))
    monkeypatch.setitem(js.FETCHERS, "serpapi", (make("serpapi", SERP_ITEMS), js.normalize_serpapi))
    monkeypatch.setattr(js, "serpapi_searches_left", no_account)
    # isolate each test's cache / usage
    from app.db import SessionLocal
    from app.models import JobApiCall, JobSearchCache
    db = SessionLocal()
    db.query(JobSearchCache).delete()
    db.query(JobApiCall).delete()
    db.commit()
    db.close()
    return {"calls": calls, "fail": fail}


def _master(client, auth, cv=None):
    r = client.put("/api/cv/master", json={"data": copy.deepcopy(cv or SAMPLE_CV), "change_summary": "initial"}, headers=auth)
    assert r.status_code == 200, r.text


# ----------------------------------------------------------------------------- units
def test_normalization_helpers():
    assert js.normalize_city("الرياض") == "Riyadh" and js.normalize_city("Al Khobar, Eastern Province") == "Khobar"
    assert js.normalize_type("FULLTIME") == "full_time" and js.normalize_type("Full-time", "Data Intern") == "internship"
    now = datetime(2026, 10, 21, tzinfo=UTC)
    assert js.parse_posted("8 days ago", now) == now - timedelta(days=8)
    assert js.parse_posted("30+ days ago", now) == now - timedelta(days=30)
    assert js.fingerprint("Nova Tech", "Backend Developer", "Riyadh") == js.fingerprint("Nova Tech Company", "Backend Developer (Riyadh)", "Riyadh")
    assert js.normalize_jsearch(JSEARCH_ITEMS[2]) is None  # outside Saudi Arabia
    assert js.normalize_serpapi({"title": "X", "location": "Dubai, UAE"}) is None
    n = js.normalize_jsearch(JSEARCH_ITEMS[0])
    assert n["city"] == "Riyadh" and n["employment_type"] == "full_time" and n["apply_url"].startswith("https://")


def test_rules_requirements_split_and_levels():
    r = wf.rules_requirements("Backend Developer", JSEARCH_ITEMS[0]["job_description"])
    assert {"Python", "SQL"} <= set(r["must"]) and "Kubernetes" in r["nice"] and "Kubernetes" not in r["must"]
    assert r["min_years"] == 2 and r["education"] == "Bachelor's" and r["level"] == "mid"
    assert wf.level_from("Senior Data Engineer", None) == "senior"
    assert wf.level_from("Software Engineering Intern", None) == "internship"


def test_experience_years_and_level():
    cv = copy.deepcopy(SAMPLE_CV)
    years = wf.years_of_experience(cv)
    assert years >= 2.5  # 2023 -> present
    cv["experience"].append({"id": "i1", "title": "Software Intern", "organization": "X", "start": "2022", "end": "2022", "bullets": []})
    assert wf.years_of_experience(cv) >= years  # internships add (at half weight), never subtract
    assert wf.level_for(0.2, True) == "internship" and wf.level_for(3, False) == "mid"


def test_score_is_explainable():
    class L:
        title = "Backend Developer"
        posted_at = datetime.now(UTC) - timedelta(days=3)
        requirements = {"must": ["Python", "SQL", "Kafka"], "nice": ["Kubernetes"], "min_years": 2, "level": "mid", "source": "ai"}

    ctx = wf.MatchContext(copy.deepcopy(SAMPLE_CV), [], ["Backend Developer"], False)
    res = wf.score_listing(L, ctx)
    keys = {b["key"] for b in res["breakdown"]}
    assert keys == {"skills", "experience", "title", "freshness"}
    assert abs(sum(b["weight"] for b in res["breakdown"]) - 1) < 0.02
    assert set(res["matching_skills"]) == {"Python", "SQL"} and res["missing_skills"] == ["Kafka"]
    expected = round(sum(b["score"] * b["weight"] for b in res["breakdown"]))
    assert abs(res["score"] - expected) <= 1 and res["confidence"] == "high"


# ----------------------------------------------------------------------------- journey
def test_full_journey(client, auth, providers):
    r = client.get("/api/jobs/recommendations", headers=auth)
    assert r.json()["state"] == "no_cv"
    assert client.post("/api/jobs/refresh", headers=auth).status_code == 412

    _master(client, auth)
    assert client.get("/api/jobs/recommendations", headers=auth).json()["state"] == "needs_refresh"

    r = client.post("/api/jobs/refresh", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["refresh"]["calls"] == {"jsearch": 2, "serpapi": 2}
    titles = [i["title"] for i in body["items"]]
    assert titles.count("Backend Developer") == 1  # JSearch + SerpApi duplicate merged
    nova = next(i for i in body["items"] if i["title"] == "Backend Developer")
    assert set(nova["providers"]) == {"jsearch", "serpapi"} and len(nova["apply_options"]) >= 2
    assert "Head of Engineering" not in titles or body["profile"]["level"] not in ("internship", "entry")
    assert all(i["city"] != "London" for i in body["items"])
    assert titles[0] == "Backend Developer"  # best match ranked first
    assert nova["match"]["score"] >= 60 and "Python" in nova["match"]["matching_skills"]
    assert body["profile"]["target_titles"][0] == "Backend Developer" and body["profile"]["source"] == "ai"
    assert body["usage"]["jsearch"]["used"] == 2

    # cooldown blocks a second refresh; force reuses the cache -> zero billable calls
    assert client.post("/api/jobs/refresh", headers=auth).status_code == 429
    r = client.post("/api/jobs/refresh", json={"force": True}, headers=auth)
    assert r.json()["refresh"]["calls"] == {"jsearch": 0, "serpapi": 0} and r.json()["refresh"]["cache_hits"] == 4
    assert providers["calls"] == {"jsearch": 2, "serpapi": 2}

    # filters, facets, sorting, pagination
    assert any(c["value"] == "Riyadh" for c in body["facets"]["cities"])
    only = client.get("/api/jobs/recommendations?city=Riyadh", headers=auth).json()
    assert only["items"] and all(i["city"] == "Riyadh" for i in only["items"])
    paged = client.get("/api/jobs/recommendations?limit=1&offset=1", headers=auth).json()
    assert len(paged["items"]) == 1 and paged["total"] == body["total"]
    assert client.get("/api/jobs/recommendations?sort=newest", headers=auth).status_code == 200

    # detail (used by Tailor CV prefill)
    d = client.get(f"/api/jobs/listings/{nova['id']}", headers=auth).json()
    assert len(d["description"]) > 80 and d["match"]["score"] == nova["match"]["score"]

    # save -> track -> notes -> list -> delete
    s = client.post("/api/jobs/saved", json={"listing_id": nova["id"]}, headers=auth)
    assert s.status_code == 201 and s.json()["status"] == "saved"
    sid = s.json()["id"]
    t = client.post("/api/jobs/saved", json={"listing_id": nova["id"], "status": "applied"}, headers=auth).json()
    assert t["id"] == sid and t["status"] == "applied" and t["applied_at"]
    p = client.patch(f"/api/jobs/saved/{sid}", json={"status": "interviewing", "notes": "HR call Sunday"}, headers=auth).json()
    assert p["status"] == "interviewing" and p["notes"] == "HR call Sunday"
    rec = client.get("/api/jobs/recommendations", headers=auth).json()
    assert next(i for i in rec["items"] if i["id"] == nova["id"])["saved"]["status"] == "interviewing"
    assert [x["id"] for x in client.get("/api/jobs/saved", headers=auth).json()] == [sid]

    # isolation: another user cannot see or save this user's feed listing / tracker row
    other = client.post("/api/auth/register", json={"email": "jobs-intruder@test.dev", "password": "password123"}).json()
    h2 = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/api/jobs/listings/{nova['id']}", headers=h2).status_code == 404
    assert client.patch(f"/api/jobs/saved/{sid}", json={"status": "offer"}, headers=h2).status_code == 404
    assert client.delete(f"/api/jobs/saved/{sid}", headers=auth).status_code == 204


def test_cv_change_updates_scores_without_api_calls(client, auth, providers):
    _master(client, auth)
    client.post("/api/jobs/refresh", headers=auth)
    before = {i["id"]: i["match"] for i in client.get("/api/jobs/recommendations", headers=auth).json()["items"]}
    calls = dict(providers["calls"])

    cv = copy.deepcopy(SAMPLE_CV)
    cv["experience"][0]["bullets"].append("Built event pipelines with Kafka and deployed them on Kubernetes")
    _master(client, auth, cv)
    after = client.get("/api/jobs/recommendations", headers=auth).json()
    assert after["cv_changed"] is True and after["can_refresh"] is True  # CV change bypasses the cooldown
    assert providers["calls"] == calls  # re-scoring is local
    changed = [i for i in after["items"] if i["id"] in before and i["match"]["score"] > before[i["id"]]["score"]]
    assert changed and "Kafka" in changed[0]["match"]["matching_skills"]

    r = client.post("/api/jobs/refresh", headers=auth)  # same titles -> served from cache
    assert r.status_code == 200 and r.json()["cv_changed"] is False and r.json()["refresh"]["calls"] == {"jsearch": 0, "serpapi": 0}


def test_monthly_cap_and_provider_failure(client, auth, providers, monkeypatch):
    _master(client, auth)
    monkeypatch.setattr(settings, "jobs_jsearch_monthly_limit", 0)
    providers["fail"]["serpapi"] = True
    r = client.post("/api/jobs/refresh", headers=auth)
    assert r.status_code == 200, r.text
    rep = r.json()["refresh"]
    assert {"provider": "jsearch", "reason": "monthly_cap"} in rep["skipped"]
    assert providers["calls"]["jsearch"] == 0  # cap stops the request before it is sent
    assert rep["errors"] and rep["errors"][0]["provider"] == "serpapi"
    assert r.json()["usage"]["serpapi"]["used"] == 2  # failed calls still count toward the budget
