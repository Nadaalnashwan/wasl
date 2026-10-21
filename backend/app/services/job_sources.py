"""Job listing providers: JSearch (OpenWeb Ninja) + SerpApi Google Jobs, both scoped to Saudi Arabia.

Guarantees
- Keys stay on the server; only a job title + "Saudi Arabia" is ever sent to a provider (never CV text or identity).
- Identical searches are served from `job_search_cache` for JOBS_CACHE_HOURS (shared by all users).
- Every billable request is logged in `job_api_calls`; a provider is skipped once its monthly cap is reached, and
  SerpApi's own free account endpoint is consulted so the real remaining quota is respected too.
- Listings from both providers are normalized to one shape and merged on a company + title + city fingerprint.
- A failing / rate-limited provider never fails the refresh; the other provider's results are still used.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import JobApiCall, JobListing, JobSearchCache

log = logging.getLogger("wasl.jobs")

SERPAPI_URL = "https://serpapi.com/search.json"
SERPAPI_ACCOUNT_URL = "https://serpapi.com/account.json"

# ----------------------------------------------------------------------------- normalization
# canonical city -> aliases (lowercase, English + Arabic)
SA_CITIES: dict[str, list[str]] = {
    "Riyadh": ["riyadh", "ar riyadh", "al riyadh", "الرياض"],
    "Jeddah": ["jeddah", "jiddah", "jidda", "جدة", "جده"],
    "Dammam": ["dammam", "ad dammam", "الدمام"],
    "Khobar": ["khobar", "al khobar", "al-khobar", "alkhobar", "الخبر"],
    "Dhahran": ["dhahran", "az zahran", "الظهران"],
    "Makkah": ["makkah", "mecca", "مكة", "مكة المكرمة"],
    "Madinah": ["madinah", "medina", "al madinah", "المدينة", "المدينة المنورة"],
    "Jubail": ["jubail", "al jubail", "الجبيل"],
    "Yanbu": ["yanbu", "ينبع"],
    "Tabuk": ["tabuk", "تبوك"],
    "Abha": ["abha", "أبها", "ابها"],
    "Taif": ["taif", "at taif", "الطائف"],
    "Buraydah": ["buraydah", "buraidah", "qassim", "al qassim", "بريدة", "القصيم"],
    "Hail": ["hail", "ha'il", "حائل"],
    "Thuwal": ["thuwal", "kaust", "ثول"],
    "NEOM": ["neom", "نيوم"],
    "Al Ahsa": ["al ahsa", "al-ahsa", "hofuf", "al hofuf", "الأحساء", "الهفوف"],
    "Jazan": ["jazan", "jizan", "جازان", "جيزان"],
    "Najran": ["najran", "نجران"],
    "KAEC": ["king abdullah economic city", "kaec", "rabigh", "رابغ"],
}
_CITY_PATTERNS = [(canon, re.compile(r"(?<!\w)" + re.escape(a) + r"(?!\w)", re.I)) for canon, al in SA_CITIES.items() for a in al]
_SA_MARKERS = re.compile(r"saudi|ksa|المملكة|السعودية", re.I)


def normalize_city(*texts: str) -> str:
    for text in texts:
        if not text:
            continue
        for canon, pat in _CITY_PATTERNS:
            if pat.search(text):
                return canon
    return ""


def is_saudi(country: str, *texts: str) -> bool:
    if country and country.upper() == "SA":
        return True
    return any(t and (_SA_MARKERS.search(t) or normalize_city(t)) for t in texts)


_TYPE_MAP = {
    "fulltime": "full_time", "full-time": "full_time", "full time": "full_time", "دوام كامل": "full_time",
    "parttime": "part_time", "part-time": "part_time", "part time": "part_time", "دوام جزئي": "part_time",
    "contractor": "contract", "contract": "contract", "temporary": "contract", "متعاقد": "contract",
    "intern": "internship", "internship": "internship", "تدريب": "internship", "تدريب داخلي": "internship",
}


def normalize_type(raw: str | None, title: str = "") -> str:
    if re.search(r"\b(intern|internship|trainee|co-?op)\b|تدريب|متدرب", title, re.I):
        return "internship"
    if not raw:
        return ""
    return _TYPE_MAP.get(raw.strip().lower(), "")


_AGO = re.compile(r"(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago", re.I)


def parse_posted(text: str | None, now: datetime | None = None) -> datetime | None:
    """'8 days ago', '21 hours ago', '30+ days ago', 'today', 'yesterday' -> aware datetime."""
    if not text:
        return None
    now = now or datetime.now(UTC)
    t = text.strip().lower()
    if t in ("today", "just posted", "just now"):
        return now
    if t == "yesterday":
        return now - timedelta(days=1)
    m = _AGO.search(t)
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2).lower()
    delta = {"minute": timedelta(minutes=n), "hour": timedelta(hours=n), "day": timedelta(days=n),
             "week": timedelta(weeks=n), "month": timedelta(days=30 * n)}[unit]
    return now - delta


def _squash(s: str) -> str:
    s = re.sub(r"\(.*?\)|\[.*?\]", " ", s.lower())
    s = re.sub(r"\b(remote|hybrid|onsite|on-site|ksa|saudi arabia|riyadh|jeddah|dammam|full[- ]time|part[- ]time)\b", " ", s)
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s)).strip()


_COMPANY_NOISE = {"company", "co", "ltd", "llc", "inc", "group", "holding", "est", "limited", "the", "for", "and"}


def _squash_company(s: str) -> str:
    return " ".join(w for w in _squash(s).split() if w not in _COMPANY_NOISE)


def fingerprint(company: str, title: str, city: str) -> str:
    key = f"{_squash_company(company)}|{_squash(title)}|{city.lower()}"
    return hashlib.sha256(key.encode()).hexdigest()


def _safe_url(url: str | None) -> str:
    return url if url and re.match(r"^https?://", url) and len(url) <= 2000 else ""


def normalize_jsearch(j: dict[str, Any]) -> dict[str, Any] | None:
    title = (j.get("job_title") or "").strip()
    if not title:
        return None
    location = j.get("job_location") or ", ".join(x for x in (j.get("job_city"), j.get("job_state")) if x)
    if not is_saudi(j.get("job_country") or "", location, j.get("job_city") or ""):
        return None
    types = j.get("job_employment_types") or [j.get("job_employment_type") or ""]
    posted = None
    if j.get("job_posted_at_timestamp"):
        posted = datetime.fromtimestamp(int(j["job_posted_at_timestamp"]), UTC)
    elif j.get("job_posted_at_datetime_utc"):
        try:
            posted = datetime.fromisoformat(str(j["job_posted_at_datetime_utc"]).replace("Z", "+00:00"))
        except ValueError:
            posted = None
    posted = posted or parse_posted(j.get("job_posted_at"))
    options = [{"title": o.get("publisher", ""), "link": _safe_url(o.get("apply_link"))}
               for o in (j.get("apply_options") or []) if _safe_url(o.get("apply_link"))]
    main_link = _safe_url(j.get("job_apply_link"))
    if main_link and main_link not in {o["link"] for o in options}:
        options.insert(0, {"title": j.get("job_publisher") or "", "link": main_link})
    city = normalize_city(j.get("job_city") or "", location)
    salary = j.get("job_salary_string") or j.get("job_salary") or ""
    return {
        "provider": "jsearch", "external_id": str(j.get("job_id") or "")[:500], "title": title[:300],
        "company": (j.get("employer_name") or "")[:300], "company_logo": _safe_url(j.get("employer_logo"))[:1000],
        "city": city, "location": (location or city or "Saudi Arabia")[:300], "country": "SA",
        "employment_type": normalize_type(types[0] if types else "", title), "is_remote": bool(j.get("job_is_remote")),
        "posted_at": posted, "apply_url": _safe_url(j.get("job_apply_link")) or (options[0]["link"] if options else ""),
        "apply_options": options[:5], "salary": salary[:200] if isinstance(salary, str) else "",
        "publisher": (j.get("job_publisher") or "")[:100], "description": (j.get("job_description") or "")[:8000],
    }


def normalize_serpapi(j: dict[str, Any]) -> dict[str, Any] | None:
    title = (j.get("title") or "").strip()
    if not title:
        return None
    ext = j.get("detected_extensions") or {}
    location = j.get("location") or ""
    remote = bool(ext.get("work_from_home")) or "anywhere" in location.lower()
    if location and not remote and not is_saudi("", location):
        return None
    posted = parse_posted(ext.get("posted_at"))
    salary = ext.get("salary") or ""
    if not posted or not salary:
        for e in j.get("extensions") or []:
            posted = posted or parse_posted(e)
            if not salary and re.search(r"\d.*(year|month|hour|sar|ريال)", e, re.I):
                salary = e
    options = [{"title": o.get("title", ""), "link": _safe_url(o.get("link"))}
               for o in (j.get("apply_options") or []) if _safe_url(o.get("link"))]
    city = normalize_city(location)
    return {
        "provider": "serpapi", "external_id": str(j.get("job_id") or "")[:500], "title": title[:300],
        "company": (j.get("company_name") or "")[:300], "company_logo": _safe_url(j.get("thumbnail"))[:1000],
        "city": city, "location": (location or "Saudi Arabia")[:300], "country": "SA",
        "employment_type": normalize_type(ext.get("schedule_type"), title), "is_remote": remote,
        "posted_at": posted, "apply_url": options[0]["link"] if options else _safe_url(j.get("share_link")),
        "apply_options": options[:5], "salary": salary.replace("\xa0", " ")[:200],
        "publisher": (j.get("via") or "").removeprefix("via ")[:100], "description": (j.get("description") or "")[:8000],
    }


# ----------------------------------------------------------------------------- budget + usage
def month_key(now: datetime | None = None) -> str:
    return (now or datetime.now(UTC)).strftime("%Y-%m")


def monthly_usage(db: Session, provider: str | None = None) -> dict[str, int]:
    stmt = select(JobApiCall.provider, func.count()).where(JobApiCall.month == month_key()).group_by(JobApiCall.provider)
    used = dict(db.execute(stmt).all())
    return {p: int(used.get(p, 0)) for p in ([provider] if provider else ["jsearch", "serpapi"])}


def monthly_limit(provider: str) -> int:
    return settings.jobs_jsearch_monthly_limit if provider == "jsearch" else settings.jobs_serpapi_monthly_limit


def usage_summary(db: Session) -> dict[str, dict[str, Any]]:
    used = monthly_usage(db)
    configured = settings.job_providers()
    return {p: {"configured": p in configured, "used": used[p], "limit": monthly_limit(p),
                "remaining": max(0, monthly_limit(p) - used[p])} for p in ("jsearch", "serpapi")}


def _record_call(db: Session, provider: str, user_id: str | None, status: str, http_status: int | None, results: int, latency_ms: int) -> None:
    db.add(JobApiCall(provider=provider, month=month_key(), user_id=user_id, status=status, http_status=http_status,
                      results=results, latency_ms=latency_ms))
    db.commit()


_serpapi_left: dict[str, Any] = {"value": None, "checked": 0.0}


async def serpapi_searches_left(client: httpx.AsyncClient) -> int | None:
    """SerpApi's account endpoint is free (not counted as a search). Cached for 10 minutes."""
    if time.monotonic() - _serpapi_left["checked"] < 600 and _serpapi_left["value"] is not None:
        return _serpapi_left["value"]
    try:
        r = await client.get(SERPAPI_ACCOUNT_URL, params={"api_key": settings.serpapi_api_key})
        if r.status_code == 200:
            _serpapi_left.update(value=int(r.json().get("plan_searches_left", 0)), checked=time.monotonic())
            return _serpapi_left["value"]
    except (httpx.HTTPError, ValueError):
        log.warning("serpapi account check failed")
    return None


# ----------------------------------------------------------------------------- search
@dataclass
class SearchQuery:
    title: str
    internship: bool = False

    def text(self) -> str:
        return f"{self.title} internship" if self.internship and "intern" not in self.title.lower() else self.title


@dataclass
class SearchReport:
    listing_ids: list[str] = field(default_factory=list)
    query_of: dict[str, str] = field(default_factory=dict)  # listing_id -> query text
    calls: dict[str, int] = field(default_factory=lambda: {"jsearch": 0, "serpapi": 0})
    cache_hits: int = 0
    skipped: list[dict[str, str]] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)


def query_key(provider: str, q: SearchQuery) -> str:
    text = re.sub(r"\s+", " ", q.text().lower()).strip()
    return hashlib.sha256(f"{provider}|{text}|sa".encode()).hexdigest()


class ProviderFailure(Exception):
    def __init__(self, status: str, http_status: int | None, message: str):
        super().__init__(message)
        self.status, self.http_status = status, http_status


async def _fetch_jsearch(client: httpx.AsyncClient, q: SearchQuery) -> list[dict[str, Any]]:
    params = {"query": f"{q.text()} in Saudi Arabia", "country": "sa", "language": "en", "page": "1", "num_pages": "1",
              "date_posted": "month"}
    if q.internship:
        params["employment_types"] = "INTERN"
    r = await client.get(f"{settings.jsearch_base_url.rstrip('/')}/search", params=params,
                         headers={"x-api-key": settings.jsearch_api_key})
    if r.status_code == 429:
        raise ProviderFailure("rate_limited", 429, "JSearch rate limit reached")
    if r.status_code >= 400:
        raise ProviderFailure("error", r.status_code, f"JSearch returned HTTP {r.status_code}")
    return r.json().get("data") or []


async def _fetch_serpapi(client: httpx.AsyncClient, q: SearchQuery) -> list[dict[str, Any]]:
    params = {"engine": "google_jobs", "q": q.text(), "location": "Saudi Arabia", "gl": "sa", "hl": "en",
              "api_key": settings.serpapi_api_key}
    r = await client.get(SERPAPI_URL, params=params)
    if r.status_code == 429:
        raise ProviderFailure("rate_limited", 429, "SerpApi rate limit reached")
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code >= 400:
        raise ProviderFailure("error", r.status_code, str(data.get("error") or f"SerpApi returned HTTP {r.status_code}")[:200])
    if data.get("error") and "hasn't returned any results" not in str(data["error"]):
        raise ProviderFailure("error", r.status_code, str(data["error"])[:200])
    return data.get("jobs_results") or []


FETCHERS = {"jsearch": (_fetch_jsearch, normalize_jsearch), "serpapi": (_fetch_serpapi, normalize_serpapi)}

_locks: dict[str, asyncio.Lock] = {}


def upsert_listing(db: Session, n: dict[str, Any], rules_requirements) -> JobListing:
    fp = fingerprint(n["company"], n["title"], n["city"])
    now = datetime.now(UTC)
    row = db.scalar(select(JobListing).where(JobListing.fingerprint == fp))
    if row is None:
        row = JobListing(fingerprint=fp, providers=[n["provider"]], external_ids={n["provider"]: n["external_id"]},
                         **{k: n[k] for k in ("title", "company", "company_logo", "city", "location", "country", "employment_type",
                                              "is_remote", "posted_at", "apply_url", "apply_options", "salary", "publisher", "description")})
        row.requirements = rules_requirements(row.title, row.description)
        row.last_seen_at = now
        db.add(row)
        db.flush()
        return row
    # merge: keep the richest fields from both providers
    if n["provider"] not in row.providers:
        row.providers = [*row.providers, n["provider"]]
    row.external_ids = {**row.external_ids, n["provider"]: n["external_id"]}
    links = {o["link"] for o in row.apply_options}
    row.apply_options = (row.apply_options + [o for o in n["apply_options"] if o["link"] not in links])[:6]
    if len(n["description"]) > len(row.description) + 200:
        row.description = n["description"]
        if row.requirements.get("source") != "ai":
            row.requirements = rules_requirements(row.title, row.description)
    for k in ("company_logo", "salary", "employment_type", "apply_url", "publisher"):
        if not getattr(row, k) and n[k]:
            setattr(row, k, n[k])
    if n["posted_at"] and (row.posted_at is None or _aware(n["posted_at"]) > _aware(row.posted_at)):
        row.posted_at = n["posted_at"]
    row.is_remote = row.is_remote or n["is_remote"]
    row.last_seen_at = now
    return row


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=UTC)


async def search(db: Session, queries: list[SearchQuery], user_id: str | None, rules_requirements,
                 transport: httpx.AsyncBaseTransport | None = None) -> SearchReport:
    """Run each query on each configured provider, honouring cache + monthly caps. Never raises for provider errors."""
    report = SearchReport()
    providers = settings.job_providers()
    if not providers:
        report.skipped.append({"provider": "all", "reason": "not_configured"})
        return report
    ttl = timedelta(hours=settings.jobs_cache_hours)
    now = datetime.now(UTC)

    def add(ids: list[str], q: SearchQuery) -> None:
        for i in ids:
            if i not in report.query_of:
                report.listing_ids.append(i)
                report.query_of[i] = q.text()

    async with httpx.AsyncClient(timeout=settings.jobs_timeout_seconds, transport=transport) as client:
        serp_left = await serpapi_searches_left(client) if "serpapi" in providers and transport is None else None
        for provider in providers:
            fetch, normalize = FETCHERS[provider]
            for q in queries:
                key = query_key(provider, q)
                lock = _locks.setdefault(f"{provider}:{key}", asyncio.Lock())
                async with lock:  # concurrent refreshes of the same query wait for the first one, then hit the cache
                    cached = db.scalar(select(JobSearchCache).where(JobSearchCache.provider == provider, JobSearchCache.query_key == key))
                    if cached and _aware(cached.fetched_at) > now - ttl:
                        report.cache_hits += 1
                        add(cached.listing_ids, q)
                        continue
                    used = monthly_usage(db, provider)[provider]
                    if used >= monthly_limit(provider):
                        report.skipped.append({"provider": provider, "reason": "monthly_cap"})
                        if cached:  # stale cache is better than nothing
                            add(cached.listing_ids, q)
                        continue
                    if provider == "serpapi" and serp_left is not None and serp_left <= settings.jobs_serpapi_reserve:
                        report.skipped.append({"provider": provider, "reason": "provider_quota_low"})
                        if cached:
                            add(cached.listing_ids, q)
                        continue
                    t0 = time.perf_counter()
                    try:
                        raw = await fetch(client, q)
                    except (ProviderFailure, httpx.HTTPError, ValueError) as exc:
                        status = exc.status if isinstance(exc, ProviderFailure) else "error"
                        http_status = exc.http_status if isinstance(exc, ProviderFailure) else None
                        _record_call(db, provider, user_id, status, http_status, 0, int((time.perf_counter() - t0) * 1000))
                        report.calls[provider] += 1
                        report.errors.append({"provider": provider, "reason": status})
                        log.warning("job provider %s failed: %s", provider, exc)
                        if cached:
                            add(cached.listing_ids, q)
                        continue
                    if serp_left is not None and provider == "serpapi":
                        serp_left -= 1
                        _serpapi_left["value"] = serp_left
                    ids = []
                    for item in raw:
                        n = normalize(item)
                        if n:
                            ids.append(upsert_listing(db, n, rules_requirements).id)
                    ids = list(dict.fromkeys(ids))
                    if cached:
                        cached.listing_ids, cached.fetched_at, cached.query = ids, datetime.now(UTC), {"text": q.text()}
                    else:
                        db.add(JobSearchCache(provider=provider, query_key=key, query={"text": q.text()}, listing_ids=ids))
                    db.commit()
                    _record_call(db, provider, user_id, "ok", 200, len(ids), int((time.perf_counter() - t0) * 1000))
                    report.calls[provider] += 1
                    add(ids, q)
    return report
