"""Job recommendations, saved jobs and the application tracker.

GET  /recommendations  never calls a job provider: it re-scores the user's feed against the CURRENT Master CV.
POST /refresh          the only route that may spend provider quota (cache first, monthly caps, per-user limits).
"""
from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.schemas import JobSearchProfile
from app.ai.workflows.jobs import (
    MatchContext,
    analyze_profile,
    cv_hash,
    enrich_requirements,
    is_relevant,
    rules_requirements,
    score_listing,
)
from app.config import settings
from app.deps import achievement_dict, get_current_user, get_db, master_cv, owned, track_task
from app.models import CV, Achievement, JobListing, JobProfile, SavedJob, User, UserJobFeed
from app.monitoring.recorder import record_quality
from app.services import job_sources
from app.services.job_sources import SearchQuery

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

TRACK_STATUSES = ("saved", "applied", "interviewing", "offer", "rejected")


def _aware(d: datetime | None) -> datetime | None:
    return d.replace(tzinfo=UTC) if d and not d.tzinfo else d


def _confirmed(db: Session, user: User) -> list[dict]:
    return [achievement_dict(a) for a in db.scalars(select(Achievement).where(Achievement.user_id == user.id, Achievement.status == "confirmed"))]


def _queries(profile: JobSearchProfile) -> list[SearchQuery]:
    """At most two searches per provider per refresh, to stay inside free tiers."""
    titles = profile.target_titles or ["Software Engineer"]
    if profile.include_internships:
        return [SearchQuery(titles[0]), SearchQuery(titles[0], internship=True)]
    return [SearchQuery(t) for t in titles[:2]]


def listing_out(lst: JobListing) -> dict:
    return {
        "id": lst.id, "title": lst.title, "company": lst.company, "company_logo": lst.company_logo, "city": lst.city,
        "location": lst.location, "employment_type": lst.employment_type, "is_remote": lst.is_remote,
        "posted_at": _aware(lst.posted_at).isoformat() if lst.posted_at else None, "apply_url": lst.apply_url,
        "apply_options": lst.apply_options, "salary": lst.salary, "publisher": lst.publisher, "providers": lst.providers,
        "level": (lst.requirements or {}).get("level", "unknown"), "education": (lst.requirements or {}).get("education", ""),
        "min_years": (lst.requirements or {}).get("min_years"), "requirements_source": (lst.requirements or {}).get("source", "rules"),
    }


def saved_out(s: SavedJob, lst: JobListing | None) -> dict:
    return {"id": s.id, "listing_id": s.listing_id, "status": s.status, "notes": s.notes, "match_score": s.match_score,
            "applied_at": _aware(s.applied_at).isoformat() if s.applied_at else None, "tailored_cv_id": s.tailored_cv_id,
            "created_at": _aware(s.created_at).isoformat(), "updated_at": _aware(s.updated_at).isoformat(),
            "job": listing_out(lst) if lst else s.snapshot, "expired": lst is None}


class _State:
    """Per-request snapshot: CV, profile row, scoring context."""

    def __init__(self, db: Session, user: User):
        self.cv: CV | None = master_cv(db, user)
        self.achievements = _confirmed(db, user)
        self.row: JobProfile | None = db.scalar(select(JobProfile).where(JobProfile.user_id == user.id))
        self.hash = cv_hash(self.cv.data, self.achievements) if self.cv and self.cv.data else ""
        self.profile = JobSearchProfile.model_validate(self.row.profile) if self.row else None
        self.ctx = (MatchContext(self.cv.data, self.achievements, self.profile.target_titles, self.profile.include_internships)
                    if self.cv and self.cv.data and self.profile else None)

    @property
    def cv_changed(self) -> bool:
        return bool(self.row and self.row.cv_hash != self.hash)


def _refresh_gate(row: JobProfile | None, cv_changed: bool, now: datetime) -> str | None:
    if row is None or row.refreshed_at is None:
        return None
    recent = [t for t in row.refresh_log if datetime.fromisoformat(t) > now - timedelta(days=1)]
    if len(recent) >= settings.jobs_refreshes_per_day:
        return "daily_limit"
    if not cv_changed and _aware(row.refreshed_at) > now - timedelta(minutes=settings.jobs_refresh_cooldown_minutes):
        return "cooldown"
    return None


def _ranked(db: Session, user: User, st: _State) -> list[tuple[JobListing, dict]]:
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=settings.jobs_listing_max_age_days)
    rows = db.execute(
        select(JobListing).join(UserJobFeed, UserJobFeed.listing_id == JobListing.id)
        .where(UserJobFeed.user_id == user.id, UserJobFeed.last_seen_at >= cutoff)
    ).scalars().all()
    out = []
    for lst in rows:
        if lst.posted_at and _aware(lst.posted_at) < cutoff:
            continue  # expired listing
        res = score_listing(lst, st.ctx, now)
        if is_relevant(lst, res, st.ctx):
            out.append((lst, res))
    out.sort(key=lambda x: -x[1]["score"])
    # the same ad sometimes arrives with and without a city: keep the best-scored copy only
    seen: dict[tuple[str, str], set[str]] = {}
    unique = []
    for lst, res in out:
        key = (job_sources.fingerprint(lst.company, lst.title, ""), "")
        cities = seen.setdefault(key, set())
        if cities and (not lst.city or "" in cities or lst.city in cities):
            continue
        cities.add(lst.city)
        unique.append((lst, res))
    return unique


def _payload(db: Session, user: User, st: _State, *, city: str | None = None, job_type: str | None = None, level: str | None = None,
             remote: str = "any", sort: str = "match", offset: int = 0, limit: int = 12) -> dict:
    now = datetime.now(UTC)
    base = {"usage": job_sources.usage_summary(db), "providers_configured": settings.job_providers()}
    if not st.cv or not st.cv.data:
        return {**base, "state": "no_cv", "items": [], "total": 0}
    if st.ctx is None:
        return {**base, "state": "needs_refresh", "cv_changed": True, "items": [], "total": 0, "can_refresh": True}
    ranked = _ranked(db, user, st)
    facets = {
        "cities": Counter(lst.city or "Other" for lst, _ in ranked).most_common(),
        "types": Counter(lst.employment_type or "unspecified" for lst, _ in ranked).most_common(),
        "levels": Counter((lst.requirements or {}).get("level", "unknown") for lst, _ in ranked).most_common(),
        "remote": sum(1 for lst, _ in ranked if lst.is_remote),
    }

    def keep(lst: JobListing) -> bool:
        if city and (lst.city or "Other") != city:
            return False
        if job_type and (lst.employment_type or "unspecified") != job_type:
            return False
        if level and (lst.requirements or {}).get("level", "unknown") != level:
            return False
        if remote == "remote" and not lst.is_remote:
            return False
        return not (remote == "onsite" and lst.is_remote)

    filtered = [(lst, r) for lst, r in ranked if keep(lst)]
    if sort == "newest":
        filtered.sort(key=lambda x: _aware(x[0].posted_at) or datetime.min.replace(tzinfo=UTC), reverse=True)
    saved = {s.listing_id: s for s in db.scalars(select(SavedJob).where(SavedJob.user_id == user.id))}
    page = filtered[offset:offset + limit]
    gate = _refresh_gate(st.row, st.cv_changed, now)
    return {
        **base, "state": "ok" if ranked else "empty", "total": len(filtered), "offset": offset, "limit": limit,
        "items": [{**listing_out(lst), "match": r, "saved": ({"id": saved[lst.id].id, "status": saved[lst.id].status}
                                                              if lst.id in saved else None)} for lst, r in page],
        "facets": {k: ([{"value": v, "count": c} for v, c in val] if isinstance(val, list) else val) for k, val in facets.items()},
        "profile": {**st.profile.model_dump(), "years": st.ctx.years, "level": st.ctx.level, "source": st.row.source if st.row else "rules"},
        "cv_changed": st.cv_changed, "last_refreshed_at": _aware(st.row.refreshed_at).isoformat() if st.row and st.row.refreshed_at else None,
        "can_refresh": gate is None, "refresh_blocked": gate,
    }


@router.get("/recommendations")
def recommendations(city: str | None = None, job_type: str | None = Query(None, alias="type"), level: str | None = None,
                    remote: Literal["any", "remote", "onsite"] = "any", sort: Literal["match", "newest"] = "match",
                    offset: int = Query(0, ge=0), limit: int = Query(12, ge=1, le=50),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    st = _State(db, user)
    return _payload(db, user, st, city=city, job_type=job_type, level=level, remote=remote, sort=sort, offset=offset, limit=limit)


class RefreshIn(BaseModel):
    force: bool = False  # bypass the cooldown (still bounded by the daily limit and monthly caps)


@router.post("/refresh")
async def refresh(body: RefreshIn | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    body = body or RefreshIn()
    st = _State(db, user)
    if not st.cv or not st.cv.data:
        raise HTTPException(412, "Create or upload your Master CV first.")
    if not settings.job_providers():
        raise HTTPException(503, "Job search is not configured on this server.")
    now = datetime.now(UTC)
    gate = _refresh_gate(st.row, st.cv_changed, now)
    if gate == "daily_limit" or (gate == "cooldown" and not body.force):
        mins = settings.jobs_refresh_cooldown_minutes
        msg = (f"Daily refresh limit reached ({settings.jobs_refreshes_per_day}). Showing your saved results."
               if gate == "daily_limit" else f"Results were refreshed less than {mins} minutes ago.")
        raise HTTPException(429, {"message": msg, "reason": gate})

    with track_task("job_recommendations", user):
        # 1. profile: re-analyse only when the CV (or confirmed achievements) changed
        if st.row is None or st.cv_changed or not st.row.profile:
            profile, source = await analyze_profile(user, st.cv.data, st.achievements)
            if st.row is None:
                st.row = JobProfile(user_id=user.id, cv_hash=st.hash, profile=profile.model_dump(), source=source)
                db.add(st.row)
            else:
                st.row.cv_hash, st.row.profile, st.row.source = st.hash, profile.model_dump(), source
            db.commit()
        profile = JobSearchProfile.model_validate(st.row.profile)

        # 2. search both providers (cache + caps inside)
        report = await job_sources.search(db, _queries(profile), user.id, rules_requirements)
        for lid in report.listing_ids:
            feed = db.scalar(select(UserJobFeed).where(UserJobFeed.user_id == user.id, UserJobFeed.listing_id == lid))
            if feed:
                feed.last_seen_at = now
            else:
                db.add(UserJobFeed(user_id=user.id, listing_id=lid, query=report.query_of.get(lid, "")[:300]))
        st.row.refreshed_at = now
        st.row.searched_hash = st.hash
        st.row.refresh_log = [t for t in st.row.refresh_log if datetime.fromisoformat(t) > now - timedelta(days=1)] + [now.isoformat()]
        db.commit()

        # 3. AI requirement extraction for the strongest candidates only (stored on the listing, never repeated)
        st = _State(db, user)
        top = [lst for lst, _ in _ranked(db, user, st)[:12]]
        enriched = await enrich_requirements(user, top)
        db.commit()

    record_quality("job_refresh", user_id=user.id, task="job_recommendations", outcome="success",
                   value=len(report.listing_ids), details={"calls": report.calls, "cache_hits": report.cache_hits,
                                                           "skipped": report.skipped, "errors": report.errors, "ai_enriched": enriched})
    st = _State(db, user)
    out = _payload(db, user, st)
    out["refresh"] = {"found": len(report.listing_ids), "calls": report.calls, "cache_hits": report.cache_hits,
                      "skipped": report.skipped, "errors": report.errors, "ai_enriched": enriched}
    return out


def _visible_listing(db: Session, user: User, listing_id: str) -> JobListing:
    lst = db.get(JobListing, listing_id)
    in_feed = lst and db.scalar(select(UserJobFeed.id).where(UserJobFeed.user_id == user.id, UserJobFeed.listing_id == listing_id))
    in_saved = lst and db.scalar(select(SavedJob.id).where(SavedJob.user_id == user.id, SavedJob.listing_id == listing_id))
    if not lst or not (in_feed or in_saved):
        raise HTTPException(404, "Job not found or no longer available.")
    return lst


@router.get("/listings/{listing_id}")
def listing(listing_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lst = _visible_listing(db, user, listing_id)
    st = _State(db, user)
    out = {**listing_out(lst), "description": lst.description, "requirements": lst.requirements}
    if st.ctx:
        out["match"] = score_listing(lst, st.ctx)
    return out


# ----------------------------------------------------------------------------- saved jobs / tracker
class SaveIn(BaseModel):
    listing_id: str
    status: Literal["saved", "applied", "interviewing", "offer", "rejected"] = "saved"


class SavedPatch(BaseModel):
    status: Literal["saved", "applied", "interviewing", "offer", "rejected"] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    tailored_cv_id: str | None = None


@router.get("/saved")
def saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SavedJob).where(SavedJob.user_id == user.id).order_by(SavedJob.updated_at.desc())).all()
    listings = {lst.id: lst for lst in db.scalars(select(JobListing).where(JobListing.id.in_([r.listing_id for r in rows if r.listing_id])))}
    return [saved_out(r, listings.get(r.listing_id)) for r in rows]


@router.post("/saved", status_code=201)
def save(body: SaveIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lst = _visible_listing(db, user, body.listing_id)
    row = db.scalar(select(SavedJob).where(SavedJob.user_id == user.id, SavedJob.listing_id == lst.id))
    st = _State(db, user)
    score = score_listing(lst, st.ctx)["score"] if st.ctx else None
    if row is None:
        row = SavedJob(user_id=user.id, listing_id=lst.id, status=body.status, snapshot=listing_out(lst), match_score=score)
        db.add(row)
    elif body.status != "saved":
        row.status = body.status
    if row.status == "applied" and row.applied_at is None:
        row.applied_at = datetime.now(UTC)
    db.commit()
    record_quality("job_saved", user_id=user.id, task="job_recommendations", outcome=row.status)
    return saved_out(row, lst)


@router.patch("/saved/{saved_id}")
def update_saved(saved_id: str, body: SavedPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = owned(db, SavedJob, saved_id, user)
    if body.status:
        row.status = body.status
        if body.status == "applied" and row.applied_at is None:
            row.applied_at = datetime.now(UTC)
    if body.notes is not None:
        row.notes = body.notes
    if body.tailored_cv_id:
        row.tailored_cv_id = owned(db, CV, body.tailored_cv_id, user).id
    db.commit()
    return saved_out(row, db.get(JobListing, row.listing_id) if row.listing_id else None)


@router.delete("/saved/{saved_id}", status_code=204)
def delete_saved(saved_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, SavedJob, saved_id, user))
    db.commit()


@router.get("/usage")
def usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"usage": job_sources.usage_summary(db), "providers_configured": settings.job_providers(),
            "cache_hours": settings.jobs_cache_hours, "cooldown_minutes": settings.jobs_refresh_cooldown_minutes,
            "refreshes_per_day": settings.jobs_refreshes_per_day}
