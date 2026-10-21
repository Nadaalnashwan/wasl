"""Agent 4 — Job Recommendations.

    Master CV ──► profile (LLM titles + deterministic level/years, cached by CV hash)
              ──► queries ──► JSearch + SerpApi (services/job_sources: cache, caps, dedup)
              ──► requirements per listing (rules for all; LLM batch for the top candidates, stored on the listing)
              ──► score (deterministic, explainable) ──► ranked feed

The score never comes from the LLM. Each listing gets four transparent components:
    skills     55%  existing must/nice evidence match (skills.match_score: verified=1, unverified=.5, missing=0)
    experience 20%  user level vs job level / required years
    title      20%  closeness of the job title to the titles the CV supports
    freshness   5%  days since posting
If a listing has no extractable skills the skills weight is redistributed and the result is marked low confidence.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from typing import Any

from app.ai.router import AIUnavailableError, run_structured
from app.ai.schemas import CVData, JobSearchProfile, ListingRequirementsBatch
from app.ai.skills import LEXICON, canonical, cv_evidence_index, find_skills, match_requirements, match_score
from app.ai.workflows.career import achievement_text
from app.security.guard import UNTRUSTED_RULES, sanitize_untrusted, wrap

LEVELS = ["internship", "entry", "mid", "senior"]
WEIGHTS = {"skills": 0.55, "experience": 0.20, "title": 0.20, "freshness": 0.05}
_LEXICON_LOWER = {c.lower() for c in LEXICON} | {a for al in LEXICON.values() for a in al}


# ----------------------------------------------------------------------------- CV -> profile
def cv_hash(cv: dict, achievements: list[dict]) -> str:
    payload = {"cv": cv, "ach": sorted((a.get("id", ""), a.get("title", ""), tuple(a.get("skills", [])),
                                        tuple(a.get("technologies", []))) for a in achievements)}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


_YEAR = re.compile(r"(19|20)\d{2}")
_PRESENT = re.compile(r"present|current|now|today|ongoing|حالي|الآن|حتى الآن", re.I)
_INTERN = re.compile(r"\b(intern|internship|trainee|co-?op|apprentice)\b|متدرب|تدريب", re.I)


def _year_of(text: str, now_year: int) -> float | None:
    if not text:
        return None
    if _PRESENT.search(text):
        return now_year + (datetime.now(UTC).month - 1) / 12
    m = _YEAR.search(text)
    return float(m.group(0)) if m else None


def years_of_experience(cv: dict) -> float:
    """Sum of role durations from CV dates; internships count half. Overlaps are merged."""
    now_year = datetime.now(UTC).year
    spans: list[tuple[float, float, float]] = []
    for e in cv.get("experience", []):
        start, end = _year_of(e.get("start", ""), now_year), _year_of(e.get("end", "") or "present", now_year)
        if start is None or end is None or end < start:
            continue
        spans.append((start, max(end, start + 0.25), 0.5 if _INTERN.search(e.get("title", "")) else 1.0))
    spans.sort()
    total, cursor = 0.0, 0.0
    for start, end, w in spans:
        start = max(start, cursor)
        if end > start:
            total += (end - start) * w
            cursor = end
    return round(total, 1)


def _is_student(cv: dict) -> bool:
    now_year = datetime.now(UTC).year
    for ed in cv.get("education", []):
        end = ed.get("end", "")
        if _PRESENT.search(end or "") or (_YEAR.search(end or "") and int(_YEAR.search(end).group(0)) >= now_year):
            return True
    return False


def level_for(years: float, student: bool) -> str:
    if years < 0.5:
        return "internship" if student else "entry"
    if years < 2:
        return "entry"
    if years < 5:
        return "mid"
    return "senior"


def rules_profile(cv: dict, achievements: list[dict]) -> JobSearchProfile:
    c = CVData.model_validate(cv)
    titles = [c.contact.headline] if c.contact.headline else []
    titles += [e.title for e in c.experience if e.title and not _INTERN.search(e.title)]
    titles = [re.sub(r"\s*[|@,–-].*$", "", t).strip() for t in titles]
    index, listed = cv_evidence_index(cv, achievements)
    ranked = sorted(index, key=lambda s: -len(index[s])) + sorted(listed - set(index))
    years, student = years_of_experience(cv), _is_student(cv)
    return JobSearchProfile(target_titles=[t for t in dict.fromkeys(titles) if t][:3] or ["Software Engineer"],
                            seniority=level_for(years, student), key_skills=ranked[:12],
                            include_internships=student or years < 1, rationale="Derived from CV headline and roles.")


PROFILE_SYSTEM = (
    "You plan a job search in Saudi Arabia for the CV owner. Return 2-4 concrete, commonly advertised job titles "
    "(English, no seniority words, no company names) that this CV can realistically compete for, best first. "
    "key_skills: the strongest skills evidenced in the CV, canonical names. include_internships: true for students, "
    "fresh graduates or anyone with under one year of experience. Do not invent anything not supported by the CV. "
    + UNTRUSTED_RULES
)


async def analyze_profile(user, cv: dict, achievements: list[dict]) -> tuple[JobSearchProfile, str]:
    """LLM picks market titles; level and years always come from deterministic rules (explainable)."""
    base = rules_profile(cv, achievements)
    c = CVData.model_validate(cv)
    outline = {
        "headline": c.contact.headline, "summary": c.summary[:500],
        "experience": [{"title": e.title, "organization": e.organization, "start": e.start, "end": e.end} for e in c.experience],
        "education": [{"degree": e.degree, "institution": e.institution, "end": e.end} for e in c.education],
        "projects": [{"name": p.name, "technologies": p.technologies} for p in c.projects][:8],
        "skills": c.skills[:30], "achievements": [a.get("title", "") for a in achievements][:10],
    }
    safe, _ = sanitize_untrusted(json.dumps(outline, ensure_ascii=False), 6000)
    prompt = f"Years of experience (computed): {years_of_experience(cv)}\nCV outline:\n{wrap('cv', safe)}"
    try:
        res = await run_structured("job_profile", PROFILE_SYSTEM, prompt, JobSearchProfile, user=user)
    except AIUnavailableError:
        return base, "rules"
    ai = res.data
    titles = [t for t in ai.target_titles if 2 <= len(t) <= 80][:4] or base.target_titles
    skills = [canonical(s) for s in ai.key_skills] or base.key_skills
    return JobSearchProfile(target_titles=titles, seniority=base.seniority, key_skills=list(dict.fromkeys(skills))[:12],
                            include_internships=base.include_internships or ai.include_internships,
                            rationale=ai.rationale[:400]), "ai"


# ----------------------------------------------------------------------------- listing requirements
_NICE_HEAD = re.compile(r"(preferred|nice[- ]to[- ]have|bonus|plus|desirable|advantage|good to have|would be great|مفضل|ميزة)", re.I)
_HEAD = re.compile(r"^\s*(?:[A-Z][\w /&-]{2,40}:?|#+.*|\*\*.*\*\*)\s*$")
_YEARS = re.compile(r"(\d{1,2})\s*\+?\s*(?:-|to|–)?\s*(?:\d{1,2}\s*)?\+?\s*(?:years?|yrs?)|(\d{1,2})\s*\+?\s*(?:سنوات|سنة)", re.I)
_SENIOR = re.compile(r"\b(senior|sr\.?|lead|principal|staff|manager|head|director|architect|chief|vp)\b", re.I)
_JUNIOR = re.compile(r"\b(junior|jr\.?|entry[- ]level|graduate|fresh|associate|new grad)\b|حديث التخرج", re.I)
_EDU = [("PhD", re.compile(r"\bph\.?d\b|doctorate|دكتوراه", re.I)), ("Master's", re.compile(r"\bmaster'?s?\b|\bmsc\b|\bm\.s\.|ماجستير", re.I)),
        ("Bachelor's", re.compile(r"\bbachelor'?s?\b|\bbsc\b|\bb\.s\.|\bdegree\b|بكالوريوس", re.I)), ("Diploma", re.compile(r"\bdiploma\b|دبلوم", re.I))]


def level_from(title: str, min_years: int | None) -> str:
    if _INTERN.search(title):
        return "internship"
    if _SENIOR.search(title):
        return "senior"
    if _JUNIOR.search(title):
        return "entry"
    if min_years is not None:
        return "entry" if min_years <= 1 else "mid" if min_years <= 4 else "senior"
    return "unknown"


def rules_requirements(title: str, description: str) -> dict[str, Any]:
    must, nice, in_nice = set(), set(), False
    for line in description.splitlines():
        if _NICE_HEAD.search(line) and len(line) < 80:
            in_nice = True
        elif _HEAD.match(line) and not _NICE_HEAD.search(line):
            in_nice = False
        (nice if in_nice else must).update(find_skills(line))
    must |= find_skills(title)
    years = [int(a or b) for a, b in _YEARS.findall(description) if 0 < int(a or b) <= 20]
    min_years = min(years) if years else None
    education = next((name for name, pat in _EDU if pat.search(description)), "")
    return {"must": sorted(must)[:12], "nice": sorted(nice - must)[:8], "min_years": min_years, "education": education,
            "level": level_from(title, min_years), "source": "rules"}


BATCH_SYSTEM = (
    "Extract hiring requirements from each job ad. must_have = explicitly required skills/tools/knowledge (max 8); "
    "nice_to_have = preferred/bonus (max 5). Each entry is ONE concrete, checkable skill, tool, technology or "
    "credential in 1-3 words (e.g. 'Python', 'SQL', 'Power BI', 'AWS', 'Communication'). Never output job types, "
    "generic phrases or domains ('Internship', 'Large datasets', 'Digital technologies', 'AI algorithms'); split "
    "lists like 'cloud platforms (AWS, Azure)' into 'AWS', 'Azure'. "
    "min_years = minimum years of experience if stated, else null. education = minimum degree if stated. "
    "level = internship | entry | mid | senior | unknown. Return one entry per job with the same ref. "
    + UNTRUSTED_RULES
)


_GENERIC = re.compile(r"^(internship|intern|experience|degree|bachelor'?s?|english|arabic|full[- ]time|teamwork skills|"
                      r"large datasets?|digital technolog(y|ies)|technology|engineering|software|ai|data)$", re.I)


def clean_skills(raw: list[str]) -> list[str]:
    """Canonicalize AI-extracted requirements: expand phrases into lexicon skills, drop vague or long entries."""
    out: list[str] = []
    for s in raw:
        s = re.sub(r"\s+(skills?|knowledge|experience)$", "", s.strip().strip("."), flags=re.I)
        if not s or len(s) > 40 or _GENERIC.match(s):
            continue
        canon = canonical(s)
        if canon.lower() in _LEXICON_LOWER:
            out.append(canon)
            continue
        found = find_skills(s)
        if found:
            out.extend(sorted(found))
        elif len(s.split()) <= 3 and "(" not in s:
            out.append(canon)
    return list(dict.fromkeys(out))


async def enrich_requirements(user, listings: list) -> int:
    """LLM extraction for listings still on rules. Result is stored on the shared listing, so it runs once per listing."""
    todo = [lst for lst in listings if (lst.requirements or {}).get("source") != "ai" and len(lst.description) >= 120]
    done = 0
    for i in range(0, len(todo), 6):
        batch = todo[i:i + 6]
        parts = []
        for n, lst in enumerate(batch):
            safe, _ = sanitize_untrusted(lst.description, 1800)
            parts.append(f"ref={n}\ntitle: {lst.title}\n{wrap('job_ad', safe)}")
        try:
            res = await run_structured("job_requirements_batch", BATCH_SYSTEM, "\n\n".join(parts), ListingRequirementsBatch, user=user)
        except AIUnavailableError:
            return done
        for item in res.data.jobs:
            if not item.ref.isdigit() or int(item.ref) >= len(batch):
                continue
            lst = batch[int(item.ref)]
            rules = lst.requirements or rules_requirements(lst.title, lst.description)
            must = clean_skills(item.must_have)[:10]
            nice = [s for s in clean_skills(item.nice_to_have) if s not in must][:6]
            if not must and not nice:
                continue
            min_years = item.min_years if item.min_years is not None else rules.get("min_years")
            level = item.level if item.level != "unknown" else level_from(lst.title, min_years)
            lst.requirements = {"must": must, "nice": nice, "min_years": min_years,
                                "education": item.education[:60] or rules.get("education", ""), "level": level, "source": "ai"}
            done += 1
    return done


# ----------------------------------------------------------------------------- scoring
_TITLE_NOISE = {"senior", "sr", "junior", "jr", "lead", "principal", "staff", "intern", "internship", "trainee", "entry", "level",
                "mid", "i", "ii", "iii", "graduate", "remote", "hybrid", "the", "a", "an", "of", "and", "for", "in", "at", "to", "with"}


def _title_tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9+#.]+", s.lower()) if t not in _TITLE_NOISE and len(t) > 1}


def title_relevance(job_title: str, targets: list[str]) -> tuple[int, str]:
    jt = job_title.lower()
    best, best_t = 0, ""
    for t in targets:
        if t and t.lower() in jt:
            return 100, t
        a, b = _title_tokens(job_title), _title_tokens(t)
        if a and b:
            s = round(min(100, 100 * len(a & b) / len(b)))  # share of the target title's words present in the job title
            if s > best:
                best, best_t = s, t
    return best, best_t


class MatchContext:
    """Everything about the user that scoring needs, computed once per request from the CURRENT CV."""

    def __init__(self, cv: dict, achievements: list[dict], targets: list[str], include_internships: bool):
        self.cv, self.achievements = cv, achievements
        self.index = cv_evidence_index(cv, achievements)
        self.years = years_of_experience(cv)
        self.level = level_for(self.years, _is_student(cv))
        self.targets = targets
        self.include_internships = include_internships
        c = CVData.model_validate(cv)
        ev = [e.title + " " + " ".join(e.bullets) for e in c.experience]
        ev += [" ".join([p.name, p.description, " ".join(p.technologies), *p.bullets]) for p in c.projects]
        ev += [x.name for x in c.certifications] + [e.degree + " " + e.details for e in c.education]
        ev += [achievement_text(a) for a in achievements]
        self.evidence_text = "\n".join(ev).lower()
        self.skills_text = " | ".join([*c.skills, c.summary]).lower()


def _literal(skill: str, text: str) -> bool:
    return bool(re.search(r"(?<![\w+#])" + re.escape(skill.lower()) + r"(?![\w+#])", text))


def _match(skills: list[str], ctx: MatchContext) -> list[dict]:
    out = []
    for e in match_requirements([{"skill": s} for s in skills], ctx.cv, ctx.achievements, ctx.index):
        d = {"skill": e.skill, "status": e.status, "sources": e.sources}
        # skills outside the lexicon (e.g. "SAP", "Kafka") are still found if written in the CV
        if e.status == "missing" and e.skill.lower() not in _LEXICON_LOWER:
            if _literal(e.skill, ctx.evidence_text):
                d.update(status="verified", sources=["CV text"])
            elif _literal(e.skill, ctx.skills_text):
                d.update(status="unverified", sources=["skills list"])
        out.append(d)
    return out


class _Ev:  # adapter so match_score can consume dicts
    def __init__(self, status: str):
        self.status = status


def score_listing(listing, ctx: MatchContext, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    req = listing.requirements or {}
    must, nice = _match(req.get("must", []), ctx), _match(req.get("nice", []), ctx)
    comps: dict[str, dict[str, Any]] = {}

    if must or nice:
        sk = match_score([_Ev(m["status"]) for m in must], [_Ev(m["status"]) for m in nice])
        comps["skills"] = {"score": sk["score"], "matched": sum(1 for m in must + nice if m["status"] != "missing"),
                           "total": len(must) + len(nice)}

    job_level = req.get("level") or "unknown"
    min_years = req.get("min_years")
    if job_level == "unknown":
        exp = 70
    else:
        diff = LEVELS.index(job_level) - LEVELS.index(ctx.level)
        if job_level == "internship":
            exp = 100 if ctx.include_internships else 35
        else:
            exp = {0: 100, -1: 75, 1: 55}.get(diff, 45 if diff < 0 else 15)
    if min_years is not None and ctx.years + 1 < min_years:
        exp = min(exp, 40 if ctx.years + 3 >= min_years else 15)
    comps["experience"] = {"score": exp, "job_level": job_level, "user_level": ctx.level, "min_years": min_years,
                           "user_years": ctx.years}

    t_score, t_best = title_relevance(listing.title, ctx.targets)
    comps["title"] = {"score": t_score, "target": t_best}

    if listing.posted_at:
        posted = listing.posted_at if listing.posted_at.tzinfo else listing.posted_at.replace(tzinfo=UTC)
        days = max(0, (now - posted).days)
        fresh = 100 if days <= 7 else 85 if days <= 14 else 65 if days <= 30 else 40
    else:
        days, fresh = None, 60
    comps["freshness"] = {"score": fresh, "days": days}

    weights = {k: w for k, w in WEIGHTS.items() if k in comps}
    total_w = sum(weights.values())
    score = round(sum(comps[k]["score"] * w for k, w in weights.items()) / total_w)
    breakdown = [{"key": k, "weight": round(w / total_w, 2), **comps[k]} for k, w in weights.items()]
    return {
        "score": score,
        "confidence": "high" if "skills" in comps and req.get("source") == "ai" else "medium" if "skills" in comps else "low",
        "breakdown": breakdown,
        "matching_skills": [m["skill"] for m in must + nice if m["status"] != "missing"],
        "missing_skills": [m["skill"] for m in must if m["status"] == "missing"],
        "missing_nice": [m["skill"] for m in nice if m["status"] == "missing"],
        "must": must, "nice": nice,
    }


def is_relevant(listing, result: dict[str, Any], ctx: MatchContext) -> bool:
    """Drop listings that share neither title words nor skills with the CV, and unrealistic leadership roles."""
    comps = {c["key"]: c for c in result["breakdown"]}
    if comps["title"]["score"] < 25 and not result["matching_skills"]:
        return False
    if ctx.level in ("internship", "entry") and re.search(r"\b(director|head of|vp|vice president|chief)\b", listing.title, re.I):
        return False
    return result["score"] >= 20
