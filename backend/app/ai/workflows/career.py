"""Agent 3 — CV Optimization & Career Analysis.

Pieces
- parse_cv:          LLM structured extraction of an uploaded CV into CVData.
- propose_cv_update: LLM proposes changes for a confirmed achievement; changes are APPLIED DETERMINISTICALLY
                     to a separate draft copy (never to the Master CV) and claim-checked.
- career graph (LangGraph), one graph with two branches:

      requirements (LLM) ──► match (deterministic, explainable) ──┬─► tailor (LLM) ──► enforce (deterministic) ──► END
                                                                  └─► roadmap (LLM) ──────────────────────────────► END

  `enforce` guarantees the "never invent" rule: only existing CV items can appear, every rewritten bullet
  and the summary must pass the claim check against the user's own CV + confirmed achievements, otherwise
  the original text is kept and the rejection is reported.
"""
from __future__ import annotations

import copy
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.ai.claims import check_claims
from app.ai.router import run_structured
from app.ai.schemas import (
    AwardItem,
    CertificationItem,
    CVData,
    CVUpdateProposal,
    EducationItem,
    ExperienceItem,
    GapRoadmap,
    JobRequirements,
    ProjectItem,
    TailoredCV,
)
from app.ai.skills import canonical, match_requirements, match_score
from app.ai.workflows.discovery import similarity
from app.security.guard import UNTRUSTED_RULES, sanitize_untrusted, wrap

# ----------------------------------------------------------------------------- CV parsing
PARSE_SYSTEM = (
    "You convert CV text into structured JSON. Copy facts exactly; do not summarise away details, do not add anything. "
    "Dates as written. Bullets as separate strings. Leave fields empty when absent. " + UNTRUSTED_RULES
)


async def parse_cv(user, text: str) -> tuple[CVData, list[str]]:
    safe, flags = sanitize_untrusted(text, 20000)
    res = await run_structured("cv_parse", PARSE_SYSTEM, f"CV text:\n{wrap('cv_upload', safe)}", CVData, user=user)
    return res.data, flags


def cv_text(cv: dict) -> str:
    """Flatten a CV for evidence / claim checking."""
    c = CVData.model_validate(cv)
    parts = [c.contact.headline, c.summary, " ".join(c.skills), " ".join(c.languages)]
    for e in c.experience:
        parts += [e.title, e.organization, e.start, e.end, *e.bullets]
    for p in c.projects:
        parts += [p.name, p.description, " ".join(p.technologies), *p.bullets]
    for ed in c.education:
        parts += [ed.degree, ed.institution, ed.start, ed.end, ed.details]
    for ce in c.certifications:
        parts += [ce.name, ce.issuer, ce.date]
    for a in c.awards:
        parts += [a.title, a.issuer, a.date, a.description]
    return "\n".join(p for p in parts if p)


def achievement_text(a: dict) -> str:
    ev = " ".join(e.get("quote", "") for e in a.get("evidence", []) if isinstance(e, dict))
    return "\n".join(filter(None, [a.get("title"), a.get("description"), a.get("impact"), a.get("contribution_note"),
                                   " ".join(a.get("technologies", [])), " ".join(a.get("skills", [])),
                                   a.get("occurred_on", ""), ev]))


# ----------------------------------------------------------------------------- CV updates
UPDATE_SYSTEM = (
    "You maintain a user's Master CV. Given the CV (with item ids) and ONE confirmed achievement, propose the minimal "
    "changes that add the achievement to the right section.\n"
    "- projects/certifications/awards/experience/education: use action add_item with fields of that section "
    "(projects: name, description, technologies, bullets, link; certifications: name, issuer, date; awards: title, issuer, "
    "date, description).\n"
    "- To extend an existing role or project use add_bullet with target_id.\n"
    "- add_skills only for skills explicitly in the achievement.\n"
    "- Never invent numbers, titles, employers, or skills. Concise, action-verb bullets.\n"
    "- If the CV already contains this achievement, return no changes and say so in rationale.\n" + UNTRUSTED_RULES
)

_ITEM_MODELS = {"projects": ProjectItem, "certifications": CertificationItem, "awards": AwardItem,
                "experience": ExperienceItem, "education": EducationItem}
_NAME_FIELD = {"projects": "name", "certifications": "name", "awards": "title", "experience": "title", "education": "degree"}


def find_duplicate_in_cv(cv: CVData, achievement: dict) -> str | None:
    aid = achievement.get("id")
    title = achievement.get("title", "")
    for section in ("projects", "certifications", "awards"):
        for it in getattr(cv, section):
            if aid and getattr(it, "achievement_id", None) == aid:
                return f"{section}: already linked to this achievement"
            name = getattr(it, _NAME_FIELD[section])
            if name and similarity(name, title) >= 0.6:
                return f"{section}: '{name}' looks like the same achievement"
    return None


def apply_changes(cv_dict: dict, proposal: CVUpdateProposal, achievement: dict) -> tuple[dict, list[dict], list[dict]]:
    """Apply proposed changes to a COPY. Returns (draft, applied, rejected)."""
    cv = CVData.model_validate(copy.deepcopy(cv_dict))
    evidence = achievement_text(achievement)
    allowed_skills = {canonical(s).lower() for s in [*achievement.get("skills", []), *achievement.get("technologies", [])]}
    applied, rejected = [], []

    def ok(text: str) -> bool:
        return check_claims(text, evidence + "\n" + cv_text(cv_dict))["passed"] if text else True

    for ch in proposal.changes:
        if ch.action == "add_item" and ch.section in _ITEM_MODELS:
            model = _ITEM_MODELS[ch.section]
            fields = {k: v for k, v in ch.item.items() if k in model.model_fields and k != "id"}
            try:
                item = model(**fields)
            except Exception:
                rejected.append({"section": ch.section, "reason": "malformed item"})
                continue
            if hasattr(item, "achievement_id"):
                item.achievement_id = achievement.get("id")
            name = getattr(item, _NAME_FIELD[ch.section])
            if not name:
                rejected.append({"section": ch.section, "reason": "missing name"})
                continue
            if any(similarity(getattr(x, _NAME_FIELD[ch.section]), name) >= 0.6 for x in getattr(cv, ch.section)):
                rejected.append({"section": ch.section, "reason": f"duplicate of existing '{name}'"})
                continue
            texts = [name, getattr(item, "description", ""), *getattr(item, "bullets", [])]
            if not all(ok(t) for t in texts):
                rejected.append({"section": ch.section, "reason": "contains claims not in the achievement", "name": name})
                continue
            if isinstance(item, ProjectItem):
                item.technologies = [t for t in item.technologies if canonical(t).lower() in allowed_skills or t.lower() in evidence.lower()]
            getattr(cv, ch.section).append(item)
            applied.append({"section": ch.section, "action": "add_item", "summary": f"Add {ch.section[:-1]} '{name}'",
                            "item_id": item.id, "reason": ch.reason})
        elif ch.action == "add_bullet" and ch.section in ("experience", "projects") and ch.bullet:
            target = next((x for x in getattr(cv, ch.section) if x.id == ch.target_id), None)
            if not target:
                rejected.append({"section": ch.section, "reason": "unknown target item"})
                continue
            if any(similarity(b, ch.bullet) >= 0.7 for b in target.bullets):
                rejected.append({"section": ch.section, "reason": "duplicate bullet"})
                continue
            if not ok(ch.bullet):
                rejected.append({"section": ch.section, "reason": "bullet contains unsupported claims"})
                continue
            target.bullets.append(ch.bullet.strip())
            label = getattr(target, "title", None) or getattr(target, "name", "")
            applied.append({"section": ch.section, "action": "add_bullet", "summary": f"Add bullet to '{label}'",
                            "item_id": target.id, "bullet": ch.bullet.strip(), "reason": ch.reason})
        elif ch.action == "add_skills":
            existing = {s.lower() for s in cv.skills}
            new = []
            for s in ch.skills:
                c = canonical(s)
                if c.lower() in allowed_skills and c.lower() not in existing:
                    new.append(c)
                    existing.add(c.lower())
            if new:
                cv.skills.extend(new)
                applied.append({"section": "skills", "action": "add_skills", "summary": f"Add skills: {', '.join(new)}",
                                "skills": new, "reason": ch.reason})
    return cv.model_dump(), applied, rejected


async def propose_cv_update(user, cv_dict: dict, achievement: dict) -> dict:
    cv = CVData.model_validate(cv_dict)
    dup = find_duplicate_in_cv(cv, achievement)
    if dup:
        return {"duplicate": dup, "draft": None, "applied": [], "rejected": [], "rationale": ""}
    safe_a, _ = sanitize_untrusted(achievement_text(achievement), 6000)
    compact = {
        "experience": [{"id": e.id, "title": e.title, "organization": e.organization} for e in cv.experience],
        "projects": [{"id": p.id, "name": p.name} for p in cv.projects],
        "certifications": [c.name for c in cv.certifications],
        "skills": cv.skills,
    }
    prompt = f"Current CV outline: {compact}\n\nConfirmed achievement (category={achievement.get('category')}):\n{wrap('achievement', safe_a)}"
    res = await run_structured("cv_update", UPDATE_SYSTEM, prompt, CVUpdateProposal, user=user)
    draft, applied, rejected = apply_changes(cv_dict, res.data, achievement)
    return {"duplicate": None, "draft": draft if applied else None, "applied": applied, "rejected": rejected,
            "rationale": res.data.rationale, "provider": res.provider}


# ----------------------------------------------------------------------------- tailoring + gap graph
REQ_SYSTEM = (
    "Extract hiring requirements from a job description. must_have = explicitly required; nice_to_have = preferred/bonus. "
    "Use short canonical skill names (e.g. 'Python', 'Docker', 'Communication'). Max 15 must-have, 10 nice-to-have. "
    + UNTRUSTED_RULES
)

TAILOR_SYSTEM = (
    "You tailor a CV to a job WITHOUT inventing anything. You may only: reorder skills, rewrite a summary using facts "
    "already in the CV, and rephrase/reorder EXISTING bullets of EXISTING items (referenced by id) to emphasise relevant "
    "requirements. Never add employers, titles, degrees, certifications, skills, tools, numbers or achievements that "
    "are not in the CV. Do not claim skills marked missing. In notes, list what you emphasised and any requirement "
    "the user cannot honestly claim." + UNTRUSTED_RULES
)

ROADMAP_SYSTEM = (
    "You are a career coach. Given verified, unverified and missing skills for a target job, build a prioritised, "
    "practical roadmap. For UNVERIFIED skills recommend how to produce evidence (project, certificate, portfolio) rather "
    "than re-learning. For MISSING skills recommend learning steps, free/official resources (name them generically, "
    "e.g. 'official documentation', no fake URLs), and a small practice project. Be realistic with weeks."
)


class CareerState(TypedDict, total=False):
    user: Any
    mode: str  # tailor | gap
    job_text: str
    cv: dict
    achievements: list[dict]
    requirements: JobRequirements
    must: list[dict]
    nice: list[dict]
    score: dict
    tailored_raw: TailoredCV
    tailored_cv: dict
    enforcement: dict
    roadmap: GapRoadmap
    injection_flags: list[str]


async def _requirements(state: CareerState) -> CareerState:
    safe, flags = sanitize_untrusted(state["job_text"], 12000)
    res = await run_structured("job_requirements", REQ_SYSTEM, wrap("job_description", safe), JobRequirements, user=state.get("user"))
    return {"requirements": res.data, "injection_flags": flags}


def _ev(e) -> dict:
    return {"skill": e.skill, "status": e.status, "sources": e.sources, "explanation": e.explanation}


def _match(state: CareerState) -> CareerState:
    req = state["requirements"]
    must = match_requirements([r.model_dump() for r in req.must_have], state["cv"], state.get("achievements"))
    nice = match_requirements([r.model_dump() for r in req.nice_to_have], state["cv"], state.get("achievements"))
    return {"must": [_ev(e) for e in must], "nice": [_ev(e) for e in nice], "score": match_score(must, nice)}


async def _tailor(state: CareerState) -> CareerState:
    cv = CVData.model_validate(state["cv"])
    outline = {
        "summary": cv.summary,
        "skills": cv.skills,
        "experience": [{"id": e.id, "title": e.title, "organization": e.organization, "bullets": e.bullets} for e in cv.experience],
        "projects": [{"id": p.id, "name": p.name, "description": p.description, "bullets": p.bullets, "technologies": p.technologies} for p in cv.projects],
    }
    gaps = [m["skill"] for m in state["must"] + state["nice"] if m["status"] == "missing"]
    safe_cv, _ = sanitize_untrusted(str(outline), 14000)
    prompt = (
        f"Job: {state['requirements'].job_title} at {state['requirements'].company}\n"
        f"Requirements: {[r.skill for r in state['requirements'].must_have]} | nice: {[r.skill for r in state['requirements'].nice_to_have]}\n"
        f"Skills the user does NOT have (never claim): {gaps}\n\nCV:\n{wrap('cv', safe_cv)}"
    )
    res = await run_structured("cv_tailor", TAILOR_SYSTEM, prompt, TailoredCV, user=state.get("user"))
    return {"tailored_raw": res.data}


def _enforce(state: CareerState) -> CareerState:
    master = CVData.model_validate(state["cv"])
    t = state["tailored_raw"]
    evidence = cv_text(state["cv"]) + "\n" + "\n".join(achievement_text(a) for a in state.get("achievements") or [])
    out = copy.deepcopy(master)
    report = {"kept_original": [], "rejected_bullets": 0, "accepted_bullets": 0, "unknown_ids": [], "claims": []}

    if t.summary:
        chk = check_claims(t.summary, evidence)
        report["claims"].append(chk)
        if chk["passed"]:
            out.summary = t.summary
        else:
            report["kept_original"].append({"field": "summary", "unsupported": chk["unsupported"]})

    for sec_name in ("experience", "projects"):
        items = {i.id: i for i in getattr(out, sec_name)}
        order = []
        for sec in getattr(t, sec_name):
            if sec.id not in items:
                report["unknown_ids"].append(sec.id)
                continue
            order.append(sec.id)
            good = []
            for b in sec.bullets:
                chk = check_claims(b, evidence)
                report["claims"].append(chk)
                if chk["passed"]:
                    good.append(b)
                    report["accepted_bullets"] += 1
                else:
                    report["rejected_bullets"] += 1
            if good:
                items[sec.id].bullets = good
            else:
                report["kept_original"].append({"field": f"{sec_name}:{sec.id}"})
        # relevant items first, others keep original order
        rest = [i for i in getattr(out, sec_name) if i.id not in order]
        setattr(out, sec_name, [items[i] for i in order] + rest)

    lower = {s.lower(): s for s in master.skills}
    ordered = [lower[canonical(s).lower()] if canonical(s).lower() in lower else lower.get(s.lower()) for s in t.skills_order]
    ordered = [s for s in dict.fromkeys(ordered) if s]
    out.skills = ordered + [s for s in master.skills if s not in ordered]

    total_checked = sum(c["claims_checked"] for c in report["claims"])
    total_bad = sum(c["unsupported_count"] for c in report["claims"])
    report["claims_checked"] = total_checked
    report["unsupported_found"] = total_bad
    report["unsupported_rate_before_enforcement"] = round(total_bad / total_checked, 3) if total_checked else 0.0
    report.pop("claims")
    return {"tailored_cv": out.model_dump(), "enforcement": report}


async def _roadmap(state: CareerState) -> CareerState:
    def names(status: str) -> list[str]:
        return [m["skill"] for m in state["must"] + state["nice"] if m["status"] == status]

    prompt = (
        f"Target job: {state['requirements'].job_title} ({state['requirements'].seniority})\n"
        f"Verified skills: {names('verified')}\nUnverified skills (claimed without evidence): {names('unverified')}\n"
        f"Missing skills: {names('missing')}\nMust-have: {[r.skill for r in state['requirements'].must_have]}"
    )
    res = await run_structured("gap_roadmap", ROADMAP_SYSTEM, prompt, GapRoadmap, user=state.get("user"))
    return {"roadmap": res.data}


def _branch(state: CareerState) -> str:
    return "tailor" if state.get("mode") == "tailor" else "roadmap"


def build_graph():
    g = StateGraph(CareerState)
    g.add_node("requirements", _requirements)
    g.add_node("match", _match)
    g.add_node("tailor", _tailor)
    g.add_node("enforce", _enforce)
    g.add_node("roadmap", _roadmap)
    g.set_entry_point("requirements")
    g.add_edge("requirements", "match")
    g.add_conditional_edges("match", _branch, {"tailor": "tailor", "roadmap": "roadmap"})
    g.add_edge("tailor", "enforce")
    g.add_edge("enforce", END)
    g.add_edge("roadmap", END)
    return g.compile()


career_graph = build_graph()


async def run_career(user, mode: str, job_text: str, cv: dict, achievements: list[dict]) -> CareerState:
    return await career_graph.ainvoke({"user": user, "mode": mode, "job_text": job_text, "cv": cv, "achievements": achievements})
