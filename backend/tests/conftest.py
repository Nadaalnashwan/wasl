"""Test setup: isolated SQLite DB + deterministic fake LLM provider (no network, no real keys)."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="wasl-test-"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{(_tmp / 'test.db').as_posix()}",
    "AI_ENABLE_FAKE_PROVIDER": "true",
    "AI_PROVIDER_PRIORITY": "fake",
    "GROQ_API_KEY": "", "GEMINI_API_KEY": "", "OPENROUTER_API_KEY": "",
    "AUTH_MODE": "local",
    "JWT_SECRET": "test-secret-test-secret-test-secret-123",
    "UPLOAD_DIR": str(_tmp / "uploads"),
    "AI_MAX_RETRIES": "2",
    "LINKEDIN_CLIENT_ID": "", "LINKEDIN_CLIENT_SECRET": "", "GITHUB_CLIENT_ID": "", "GITHUB_CLIENT_SECRET": "",
    # job tests inject fake keys + fake fetchers; real keys from backend/.env must never reach a test
    "JSEARCH_API_KEY": "", "SERPAPI_API_KEY": "",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

# make retry backoff instant in tests
import app.ai.router as _router  # noqa: E402
from app.ai.providers.fake import FakeProvider  # noqa: E402
from app.main import app  # noqa: E402


async def _no_sleep(_s):
    return None


_router.asyncio.sleep = _no_sleep  # type: ignore[attr-defined]


def default_responder(messages) -> str:
    system = messages[0].content
    user = messages[-1].content
    if "LinkedIn writing assistant" in system or "improve the clarity" in system:
        return json.dumps({"content": "I'm proud to share that I built an AI resume parser using Python and FastAPI. "
                           "It helps students structure their CVs automatically.", "hashtags": ["AI", "Python"],
                           "facts_used": ["AI resume parser", "Python", "FastAPI"]})
    if "achievement discovery agent" in system:
        quote = "Built an AI resume parser with Python and FastAPI"
        found = quote in user
        return json.dumps({"achievements": [{
            "title": "AI resume parser", "description": "Built an AI resume parser for students.", "category": "project",
            "technologies": ["Python", "FastAPI", "Kubernetes"], "skills": ["Python"],
            "evidence_quotes": [quote if found else "this quote is not in the source"], "confidence": 0.9,
            "needs_contribution_confirmation": False}]} if "resume parser" in user else {"achievements": [], "no_achievement_reason": "nothing"})
    if "convert CV text" in system:
        return json.dumps({"contact": {"full_name": "Sara Ali", "email": "sara@example.com"}, "summary": "Software engineer.",
                           "experience": [{"title": "Backend Developer", "organization": "Acme", "bullets": ["Built REST APIs in Python"]}],
                           "skills": ["Python", "SQL"]})
    if "maintain a user's Master CV" in system:
        return json.dumps({"changes": [
            {"section": "projects", "action": "add_item", "item": {"name": "AI resume parser", "description": "Built an AI resume parser for students.",
                                                                     "technologies": ["Python", "FastAPI"], "bullets": ["Built an AI resume parser with Python and FastAPI"]}},
            {"section": "skills", "action": "add_skills", "skills": ["FastAPI", "Kubernetes"]},
        ], "rationale": "New project"})
    if "plan a job search" in system:
        return json.dumps({"target_titles": ["Backend Developer", "Python Developer"], "seniority": "senior",
                           "key_skills": ["Python", "SQL"], "include_internships": False, "rationale": "Backend roles in CV"})
    if "Extract hiring requirements from each job ad" in system:
        refs = [line.split("=", 1)[1] for line in user.splitlines() if line.startswith("ref=")]
        return json.dumps({"jobs": [{"ref": r, "must_have": ["Python", "SQL", "Kafka"], "nice_to_have": ["Kubernetes"],
                                     "min_years": 2, "education": "Bachelor's", "level": "mid"} for r in refs]})
    if "Extract hiring requirements" in system:
        return json.dumps({"job_title": "ML Engineer", "company": "Nova", "seniority": "mid",
                           "must_have": [{"skill": "Python"}, {"skill": "Docker"}, {"skill": "SQL"}],
                           "nice_to_have": [{"skill": "Kubernetes"}], "responsibilities": ["Build ML APIs"]})
    if "tailor a CV" in system:
        exp_id = json.loads(json.dumps(user.split("'id': '")[1].split("'")[0])) if "'id': '" in user else "x"
        return json.dumps({"summary": "Backend developer focused on Python APIs.", "skills_order": ["SQL", "Python"],
                           "experience": [{"id": exp_id, "bullets": ["Built REST APIs in Python", "Managed Kubernetes clusters for 500 users"]}],
                           "projects": [], "highlighted_item_ids": [exp_id], "notes": ["Emphasised Python"]})
    if "career coach" in system:
        return json.dumps({"overview": "Focus on Docker.", "steps": [{"skill": "Docker", "priority": "high", "why": "Required",
                                                                       "resources": ["official documentation"], "practice_project": "Containerise your API",
                                                                       "est_weeks": 2}], "quick_wins": ["Add SQL project evidence"]})
    return json.dumps({})


@pytest.fixture(autouse=True)
def fake_llm():
    FakeProvider.responder = staticmethod(default_responder)
    FakeProvider.error_queue = []
    FakeProvider.calls = 0
    yield FakeProvider


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


@pytest.fixture
def auth(client):
    """Registers a fresh user and returns auth headers."""
    _counter["n"] += 1
    r = client.post("/api/auth/register", json={"email": f"user{_counter['n']}@test.dev", "password": "password123", "full_name": "Test User"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


SAMPLE_CV = {
    "contact": {"full_name": "Sara Ali", "headline": "Backend Developer", "email": "sara@example.com"},
    "summary": "Backend developer.",
    "experience": [{"id": "exp1", "title": "Backend Developer", "organization": "Acme", "start": "2023", "end": "Present",
                    "bullets": ["Built REST APIs in Python", "Maintained SQL databases"]}],
    "education": [{"id": "ed1", "degree": "BSc Computer Science", "institution": "UQU", "start": "2019", "end": "2023"}],
    "projects": [], "certifications": [], "awards": [],
    "skills": ["Python", "SQL", "Docker"], "languages": ["Arabic", "English"],
}
