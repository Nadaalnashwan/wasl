"""Achievement Discovery: evidence document upload + GitHub repository scanning."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.router import AIUnavailableError
from app.ai.workflows.discovery import discover
from app.config import settings
from app.deps import get_current_user, get_db, track_task
from app.models import Integration, RepoSnapshot, Upload, User
from app.monitoring.recorder import record_quality
from app.routers.achievements import existing_for_dedupe, save_candidates
from app.security.crypto import decrypt
from app.services import github
from app.services.documents import UploadRejected, store, validate_and_extract

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


class ScanIn(BaseModel):
    repos: list[str] = Field(min_length=1, max_length=20)
    force: bool = False


@router.post("/upload")
async def upload_evidence(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = await file.read()
    try:
        doc = validate_and_extract(file.filename or "document", data)
    except UploadRejected as exc:
        raise HTTPException(422, str(exc)) from exc
    with track_task("achievement_extraction", user):
        state = await discover(user, "upload", doc.filename, doc.text, existing_for_dedupe(db, user))
    path = store(user.id, doc, data)
    up = Upload(user_id=user.id, filename=doc.filename, mime=doc.mime, size_bytes=doc.size, sha256=doc.sha256, purpose="evidence",
                storage_path=path, text_chars=len(doc.text), injection_flags=state.get("injection_flags", []))
    db.add(up)
    db.commit()
    if state.get("injection_flags"):
        record_quality("injection_detected", user_id=user.id, task="achievement_extraction", details={"flags": len(state["injection_flags"])})
    saved = save_candidates(db, user, state["candidates"], "upload", f"upload:{up.id}:{doc.filename}")
    return {"candidates": saved, "no_achievement_reason": state["extraction"].no_achievement_reason,
            "injection_flags": state.get("injection_flags", []), "file": doc.filename}


def _github(db: Session, user: User) -> Integration:
    if not settings.github_configured:
        raise HTTPException(503, "GitHub integration is not configured on this server (GITHUB_CLIENT_ID/SECRET).")
    integ = db.scalar(select(Integration).where(Integration.user_id == user.id, Integration.provider == "github"))
    if not integ or integ.status != "connected":
        raise HTTPException(412, "Connect your GitHub account in Settings first.")
    return integ


@router.get("/github/repos")
async def repos(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    integ = _github(db, user)
    try:
        items = await github.list_repos(decrypt(integ.access_token_enc))
    except github.GitHubError as exc:
        if exc.status == 401:
            integ.status = "expired"
            db.commit()
        raise HTTPException(502, str(exc)) from exc
    snaps = {s.full_name: s for s in db.scalars(select(RepoSnapshot).where(RepoSnapshot.user_id == user.id))}
    for r in items:
        s = snaps.get(r["full_name"])
        r["scan_state"] = "new" if not s else ("updated" if s.pushed_at != r["pushed_at"] else "unchanged")
        r["last_scanned_at"] = s.last_scanned_at.isoformat() if s else None
    return {"account": integ.account_name, "repos": items}


@router.post("/github/scan")
async def scan(body: ScanIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    integ = _github(db, user)
    token = decrypt(integ.access_token_enc)
    selected = list(dict.fromkeys(body.repos))[: settings.github_max_repos_per_scan]
    results = []
    for full_name in selected:
        snap = db.scalar(select(RepoSnapshot).where(RepoSnapshot.user_id == user.id, RepoSnapshot.full_name == full_name))
        try:
            text, meta = await github.repo_bundle(token, full_name, integ.account_name)
        except github.GitHubError as exc:
            results.append({"repo": full_name, "status": "error", "message": str(exc)})
            continue
        if snap and not body.force and snap.pushed_at == meta["pushed_at"] and snap.readme_sha == meta["readme_sha"]:
            results.append({"repo": full_name, "status": "unchanged"})
            continue
        try:
            with track_task("repo_analysis", user):
                state = await discover(user, "github", full_name, text, existing_for_dedupe(db, user), repo_meta=meta)
        except AIUnavailableError as exc:
            results.append({"repo": full_name, "status": "error", "message": exc.reason})
            break
        saved = save_candidates(db, user, state["candidates"], "github", f"github:{full_name}")
        if snap is None:
            snap = RepoSnapshot(user_id=user.id, full_name=full_name)
            db.add(snap)
        snap.pushed_at = meta["pushed_at"] or ""
        snap.readme_sha = meta["readme_sha"]
        snap.last_scanned_at = datetime.now(UTC)
        db.commit()
        results.append({"repo": full_name, "status": "scanned", "candidates": saved,
                        "your_commits": meta["your_commits"], "injection_flags": state.get("injection_flags", []),
                        "no_achievement_reason": state["extraction"].no_achievement_reason})
    skipped = list(dict.fromkeys(body.repos))[settings.github_max_repos_per_scan:]
    return {"results": results, "skipped_over_limit": skipped}
