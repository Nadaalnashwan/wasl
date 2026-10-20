"""Agent 2 — Achievement Discovery & Verification (LangGraph).

    sanitize ──► extract (LLM) ──► verify_evidence (deterministic) ──► dedupe ──► END

- sanitize: prompt-injection redaction + delimiting of untrusted sources (files, READMEs).
- extract: structured extraction (Pydantic) of candidate achievements.
- verify_evidence: every evidence quote must literally occur in the source; skills/technologies that do
  not occur in the source are dropped; confidence is down-weighted by the share of verified quotes.
  Repository-derived achievements ALWAYS require the user to confirm their personal contribution —
  authorship is never inferred from repository content.
- dedupe: fingerprint + token-overlap similarity against the user's existing achievements.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.ai.router import run_structured
from app.ai.schemas import AchievementExtraction
from app.ai.skills import canonical, find_skills
from app.security.guard import UNTRUSTED_RULES, sanitize_untrusted, wrap

SYSTEM = (
    "You are Wasl's achievement discovery agent. From the source material, identify concrete professional "
    "achievements (projects built, certifications earned, awards, roles, measurable results).\n"
    "Rules:\n"
    "- Only extract what the source actually supports. If nothing qualifies, return an empty list and explain in "
    "no_achievement_reason.\n"
    "- evidence_quotes must be short VERBATIM quotes copied from the source (max 25 words each).\n"
    "- technologies/skills must be explicitly mentioned in the source.\n"
    "- For repositories or team documents, you cannot know what this user personally did: set "
    "needs_contribution_confirmation=true and ask a specific contribution_question.\n"
    "- confidence: 0.9+ only when the source clearly states the achievement and outcome.\n"
    "- Write title/description in the source's language.\n" + UNTRUSTED_RULES
)


class DiscoveryState(TypedDict, total=False):
    user: Any
    source_type: str  # manual | upload | github
    source_label: str
    raw_text: str
    repo_meta: dict
    existing: list[dict]
    safe_text: str
    injection_flags: list[str]
    extraction: AchievementExtraction
    candidates: list[dict]
    provider: str


def fingerprint(title: str) -> str:
    norm = re.sub(r"[^\w\s]", "", title.lower())
    norm = " ".join(sorted(set(norm.split())))
    return hashlib.sha256(norm.encode()).hexdigest()[:32]


def _tokens(text: str) -> set[str]:
    stop = {"a", "an", "the", "and", "of", "for", "to", "in", "on", "with", "my", "using", "project", "و", "في", "من"}
    return {t for t in re.findall(r"\w+", text.lower()) if len(t) > 2 and t not in stop}


def similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    return len(ta & tb) / len(ta | tb) if ta and tb else 0.0


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s%]", " ", s.lower())).strip()


def _sanitize(state: DiscoveryState) -> DiscoveryState:
    safe, flags = sanitize_untrusted(state["raw_text"])
    return {"safe_text": safe, "injection_flags": flags}


async def _extract(state: DiscoveryState) -> DiscoveryState:
    meta = state.get("repo_meta") or {}
    meta_txt = "\n".join(f"{k}: {v}" for k, v in meta.items() if v not in (None, "", []))
    prompt = (
        f"Source type: {state['source_type']} ({state.get('source_label', '')})\n"
        + (f"Verified metadata from the GitHub API:\n{meta_txt}\n" if meta_txt else "")
        + f"\n{wrap(state['source_type'], state['safe_text'])}"
    )
    res = await run_structured("achievement_extraction" if state["source_type"] != "github" else "repo_analysis",
                               SYSTEM, prompt, AchievementExtraction, user=state.get("user"))
    return {"extraction": res.data, "provider": res.provider}


def _verify(state: DiscoveryState) -> DiscoveryState:
    src = state["safe_text"]
    meta = state.get("repo_meta") or {}
    src_all = src + "\n" + " ".join(str(v) for v in meta.values())
    src_sq = _squash(src_all)
    src_skills = {s.lower() for s in find_skills(src_all)}
    out = []
    for a in state["extraction"].achievements:
        quotes = [q for q in a.evidence_quotes if q.strip()]
        verified = [q for q in quotes if _squash(q) and _squash(q) in src_sq]
        ratio = len(verified) / len(quotes) if quotes else 0.0

        def supported(term: str) -> bool:
            c = canonical(term)
            return c.lower() in src_skills or _squash(term) in src_sq

        techs = [canonical(t) for t in a.technologies if supported(t)]
        skills = [canonical(s) for s in a.skills if supported(s)]
        dropped = [t for t in [*a.technologies, *a.skills] if not supported(t)]
        conf = round(a.confidence * (0.5 + 0.5 * ratio), 2)
        needs_conf = a.needs_contribution_confirmation or state["source_type"] == "github"
        out.append({
            "title": a.title.strip(),
            "description": a.description.strip(),
            "category": a.category,
            "technologies": sorted(set(techs)),
            "skills": sorted(set(skills)),
            "impact": a.impact.strip(),
            "occurred_on": a.occurred_on,
            "evidence": [{"quote": q, "source": state.get("source_label", ""), "verified": True} for q in verified]
                        + ([{"source": "github_api", "repo": meta.get("full_name"), "url": meta.get("html_url")}] if meta else []),
            "unverified_quotes": len(quotes) - len(verified),
            "dropped_terms": dropped,
            "confidence": conf,
            "needs_contribution_confirmation": needs_conf,
            "contribution_question": a.contribution_question
            or ("What exactly did you personally build or contribute in this repository?" if needs_conf else ""),
        })
    return {"candidates": out}


def _dedupe(state: DiscoveryState) -> DiscoveryState:
    existing = state.get("existing") or []
    seen: list[dict] = []
    for c in state["candidates"]:
        fp = fingerprint(c["title"])
        c["fingerprint"] = fp
        dup = None
        for e in existing:
            if e.get("fingerprint") == fp or similarity(c["title"] + " " + c["description"], e["title"] + " " + e.get("description", "")) >= 0.6:
                dup = e
                break
        if not dup:
            for s in seen:
                if s["fingerprint"] == fp:
                    dup = {"id": None, "title": s["title"]}
        c["duplicate_of"] = {"id": dup.get("id"), "title": dup["title"]} if dup else None
        seen.append(c)
    return {"candidates": state["candidates"]}


def build_graph():
    g = StateGraph(DiscoveryState)
    g.add_node("sanitize", _sanitize)
    g.add_node("extract", _extract)
    g.add_node("verify_evidence", _verify)
    g.add_node("dedupe", _dedupe)
    g.set_entry_point("sanitize")
    g.add_edge("sanitize", "extract")
    g.add_edge("extract", "verify_evidence")
    g.add_edge("verify_evidence", "dedupe")
    g.add_edge("dedupe", END)
    return g.compile()


discovery_graph = build_graph()


async def discover(user, source_type: str, source_label: str, text: str, existing: list[dict],
                   repo_meta: dict | None = None) -> DiscoveryState:
    return await discovery_graph.ainvoke({
        "user": user, "source_type": source_type, "source_label": source_label, "raw_text": text,
        "existing": existing, "repo_meta": repo_meta or {},
    })
