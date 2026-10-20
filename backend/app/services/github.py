"""GitHub OAuth App + REST API reads (only what the user authorised; only repos they select).

Docs: https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
To keep API usage low: repos are listed once per page load, and only repos the user picks are scanned
(max GITHUB_MAX_REPOS_PER_SCAN); unchanged repos (same pushed_at) are skipped unless forced.
"""
from __future__ import annotations

import base64
from urllib.parse import urlencode

import httpx

from app.config import settings

API = "https://api.github.com"
MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml", "pom.xml", "go.mod", "Cargo.toml", "Dockerfile"]


class GitHubError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def authorize_url(state: str) -> str:
    return "https://github.com/login/oauth/authorize?" + urlencode({
        "client_id": settings.github_client_id, "redirect_uri": settings.github_redirect_uri,
        "scope": settings.github_scopes, "state": state, "allow_signup": "false",
    })


async def exchange_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post("https://github.com/login/oauth/access_token", headers={"Accept": "application/json"}, data={
            "client_id": settings.github_client_id, "client_secret": settings.github_client_secret, "code": code,
            "redirect_uri": settings.github_redirect_uri,
        })
    data = r.json() if r.status_code == 200 else {}
    if "access_token" not in data:
        raise GitHubError(f"GitHub token exchange failed: {data.get('error', r.status_code)}")
    return data


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}


async def _get(client: httpx.AsyncClient, token: str, path: str, **params):
    r = await client.get(f"{API}{path}", headers=_headers(token), params=params)
    if r.status_code == 401:
        raise GitHubError("GitHub token is invalid or revoked. Reconnect GitHub.", 401)
    if r.status_code == 403 and r.headers.get("x-ratelimit-remaining") == "0":
        raise GitHubError("GitHub API rate limit reached. Try again later.", 429)
    return r


async def me(token: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await _get(c, token, "/user")
    if r.status_code != 200:
        raise GitHubError(f"GitHub user lookup failed ({r.status_code})", r.status_code)
    return r.json()


async def list_repos(token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await _get(c, token, "/user/repos", sort="pushed", per_page=50, affiliation="owner,collaborator")
    if r.status_code != 200:
        raise GitHubError(f"Could not list repositories ({r.status_code})", r.status_code)
    return [{"full_name": x["full_name"], "name": x["name"], "description": x.get("description") or "",
             "language": x.get("language"), "stars": x.get("stargazers_count", 0), "fork": x.get("fork", False),
             "private": x.get("private", False), "pushed_at": x.get("pushed_at", ""), "html_url": x.get("html_url"),
             "owner": x.get("owner", {}).get("login")} for x in r.json()]


async def repo_bundle(token: str, full_name: str, login: str) -> tuple[str, dict]:
    """README + manifests + metadata. Returns (text_for_analysis, verified_metadata)."""
    async with httpx.AsyncClient(timeout=25) as c:
        info = await _get(c, token, f"/repos/{full_name}")
        if info.status_code != 200:
            raise GitHubError(f"Repository {full_name} not accessible ({info.status_code})", info.status_code)
        repo = info.json()
        langs = await _get(c, token, f"/repos/{full_name}/languages")
        contrib = await _get(c, token, f"/repos/{full_name}/contributors", per_page=100)
        readme = await _get(c, token, f"/repos/{full_name}/readme")
        contents = await _get(c, token, f"/repos/{full_name}/contents")
        files = [f["name"] for f in contents.json()] if contents.status_code == 200 and isinstance(contents.json(), list) else []
        manifest_text = []
        for name in [m for m in MANIFESTS if m in files][:3]:
            r = await _get(c, token, f"/repos/{full_name}/contents/{name}")
            if r.status_code == 200 and r.json().get("encoding") == "base64":
                manifest_text.append(f"--- {name} ---\n" + base64.b64decode(r.json()["content"]).decode("utf-8", "replace")[:3000])
    readme_txt, readme_sha = "", ""
    if readme.status_code == 200 and readme.json().get("encoding") == "base64":
        readme_txt = base64.b64decode(readme.json()["content"]).decode("utf-8", "replace")[:15000]
        readme_sha = readme.json().get("sha", "")
    contributors = contrib.json() if contrib.status_code == 200 and isinstance(contrib.json(), list) else []
    total = sum(x.get("contributions", 0) for x in contributors)
    mine = next((x.get("contributions", 0) for x in contributors if x.get("login", "").lower() == login.lower()), 0)
    meta = {
        "full_name": repo["full_name"], "html_url": repo.get("html_url"), "description": repo.get("description") or "",
        "topics": ", ".join(repo.get("topics", [])), "languages": ", ".join(list((langs.json() if langs.status_code == 200 else {}).keys())[:8]),
        "stars": repo.get("stargazers_count", 0), "created_at": repo.get("created_at"), "pushed_at": repo.get("pushed_at"),
        "is_fork": repo.get("fork"), "owner": repo.get("owner", {}).get("login"),
        "your_commits": mine, "total_commits_by_top_contributors": total, "contributors": len(contributors),
        "top_level_files": ", ".join(files[:40]), "readme_sha": readme_sha,
    }
    text = f"README of {full_name}:\n{readme_txt or '(no README)'}\n\n" + "\n\n".join(manifest_text)
    return text, meta
