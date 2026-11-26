"""Evidence review in the studio: read-only re-check, re-check on save, and no way to weaken verification."""
from __future__ import annotations


def _achievement_post(client, auth):
    a = client.post("/api/achievements?auto_cv_update=false", json={"title": "Parser", "description": "Built a parser in Python for 120 students.",
                                                                     "category": "project"}, headers=auth).json()["achievement"]
    return client.post("/api/posts/generate", json={"achievement_id": a["id"]}, headers=auth).json()


def _flagged(report):
    return {c["value"] for c in report["claims"] if c["status"] != "supported"}


def test_check_is_read_only_and_matches_publish_rules(client, auth):
    p = _achievement_post(client, auth)
    assert p["claim_check"]["evidence_source"] == "achievement"
    text = "I built a parser in Python for 120 students and grew revenue by 340%."
    r = client.post(f"/api/posts/{p['id']}/check", json={"content": text}, headers=auth)
    assert r.status_code == 200 and r.json()["evidence_source"] == "achievement"
    report = r.json()["claim_check"]
    assert "340%" in _flagged(report) and report["passed"] is False
    assert any(c["status"] == "supported" and c["value"].startswith("120") for c in report["claims"])
    # nothing was saved
    saved = next(x for x in client.get("/api/posts", headers=auth).json() if x["id"] == p["id"])
    assert saved["content"] == p["content"] and saved["claim_check"] == p["claim_check"]


def test_check_ignores_client_evidence_for_achievement_posts(client, auth):
    p = _achievement_post(client, auth)
    # a client cannot make a claim "supported" by sending its own evidence for an achievement post
    r = client.post(f"/api/posts/{p['id']}/check",
                    json={"content": "I grew revenue by 340%.", "evidence_text": "I grew revenue by 340% across all clinics."}, headers=auth)
    assert "340%" in _flagged(r.json()["claim_check"])


def test_description_posts_recheck_against_the_users_description(client, auth):
    desc = "I built an AI resume parser with Python and FastAPI for students."
    p = client.post("/api/posts/generate", json={"text": desc}, headers=auth).json()
    assert p["claim_check"]["evidence_source"] == "description"
    edited = "I built an AI resume parser with Python and FastAPI. It now serves 900 users."
    # without the description there is nothing to check against: say so, never pretend
    r = client.post(f"/api/posts/{p['id']}/check", json={"content": edited}, headers=auth)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "evidence_not_stored"
    r = client.post(f"/api/posts/{p['id']}/check", json={"content": edited, "evidence_text": desc}, headers=auth)
    assert any(v.startswith("900") for v in _flagged(r.json()["claim_check"]))
    # saving with the description stores the fresh report
    saved = client.patch(f"/api/posts/{p['id']}", json={"content": edited, "evidence_text": desc}, headers=auth).json()
    assert any(v.startswith("900") for v in _flagged(saved["claim_check"])) and saved["claim_check"]["edited_by_user"] is True
    assert "evidence_text" not in saved


def test_description_post_edited_without_description_is_marked_stale(client, auth):
    p = client.post("/api/posts/generate", json={"text": "I built an AI resume parser with Python and FastAPI for students."}, headers=auth).json()
    saved = client.patch(f"/api/posts/{p['id']}", json={"content": "Completely new text with 75% growth."}, headers=auth).json()
    assert saved["claim_check"]["stale"] is True
    # hashtag-only edits do not mark the check stale
    p2 = client.post("/api/posts/generate", json={"text": "I built an AI resume parser with Python and FastAPI for students."}, headers=auth).json()
    saved2 = client.patch(f"/api/posts/{p2['id']}", json={"hashtags": ["#AI"]}, headers=auth).json()
    assert not saved2["claim_check"].get("stale")


def test_check_requires_ownership(client, auth):
    p = _achievement_post(client, auth)
    other = client.post("/api/auth/register", json={"email": "reviewer-b@example.com", "password": "Another#Pass123", "full_name": "B"}).json()
    r = client.post(f"/api/posts/{p['id']}/check", json={"content": "x"}, headers={"Authorization": f"Bearer {other['access_token']}"})
    assert r.status_code == 404
