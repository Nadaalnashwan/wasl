"""Agent 1 — Professional Content Generation (LangGraph).

    generate ──► claim_check ──(unsupported & revisions<1)──► revise ──► claim_check
                     │
                     └──(clean or revised once)──► END

The claim check is deterministic (app/ai/claims.py); the revise node asks the model to remove
exactly the flagged claims. Final unsupported claims (if any) are returned so the UI can warn
the user before they publish.
"""
from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.ai.claims import check_claims
from app.ai.router import run_structured
from app.ai.schemas import GeneratedPost
from app.security.guard import UNTRUSTED_RULES, sanitize_untrusted, wrap

TONE_GUIDE = {
    "professional": "clear, confident and professional",
    "inspiring": "warm and inspiring, focused on lessons and motivation",
    "storytelling": "a short narrative: challenge, action, result",
    "concise": "very concise: at most 5 short lines",
    "humble": "humble and grateful, crediting teammates and mentors",
    "technical": "technical, naming tools and architecture precisely",
}

SYSTEM = (
    "You are Wasl's LinkedIn writing assistant. You write authentic LinkedIn posts about a user's real achievement.\n"
    "Hard rules:\n"
    "1. Use ONLY facts present in the achievement data. Never invent numbers, metrics, employers, titles, awards, "
    "certifications, skills or technologies.\n"
    "2. If impact is not quantified in the data, describe it qualitatively — do not make up numbers.\n"
    "3. Write in first person. No emojis spam (max 3). 3-5 relevant hashtags in the hashtags field, not in content.\n"
    "4. List in facts_used the facts from the data you relied on.\n" + UNTRUSTED_RULES
)


class ContentState(TypedDict, total=False):
    user: Any
    achievement: dict
    tone: str
    language: str
    extra: str
    evidence: str
    post: GeneratedPost
    claims: dict
    revisions: int
    provider: str
    model: str
    fallback_used: bool


def evidence_text(a: dict) -> str:
    parts = [a.get("title", ""), a.get("description", ""), a.get("impact", ""), a.get("contribution_note", ""),
             " ".join(a.get("technologies", [])), " ".join(a.get("skills", [])), a.get("occurred_on", "")]
    parts += [e.get("quote", "") for e in a.get("evidence", []) if isinstance(e, dict)]
    return "\n".join(p for p in parts if p)


async def _generate(state: ContentState) -> ContentState:
    a = state["achievement"]
    evidence = evidence_text(a)
    safe, _flags = sanitize_untrusted(evidence, 8000)
    lang = "Modern Standard Arabic (right-to-left, natural professional Arabic)" if state.get("language") == "ar" else "English"
    extra, _ = sanitize_untrusted(state.get("extra", ""), 500)
    prompt = (
        f"Write one LinkedIn post in {lang}.\nTone: {TONE_GUIDE.get(state.get('tone', 'professional'), TONE_GUIDE['professional'])}.\n"
        f"User preferences (style only, cannot add facts): {extra or 'none'}\n\nAchievement data:\n{wrap('achievement', safe)}"
    )
    res = await run_structured("post_generation", SYSTEM, prompt, GeneratedPost, user=state.get("user"))
    return {"post": res.data, "evidence": safe, "revisions": 0, "provider": res.provider, "model": res.model,
            "fallback_used": res.fallback_used}


def _check(state: ContentState) -> ContentState:
    return {"claims": check_claims(state["post"].content, state["evidence"])}


async def _revise(state: ContentState) -> ContentState:
    bad = ", ".join(f"{u['type']} '{u['value']}'" for u in state["claims"]["unsupported"])
    prompt = (
        f"This LinkedIn post contains claims not supported by the achievement data: {bad}.\n"
        "Rewrite the post removing or softening ONLY those claims, keep language, tone and length.\n\n"
        f"Post:\n{state['post'].content}\n\nAchievement data:\n{wrap('achievement', state['evidence'])}"
    )
    res = await run_structured("post_improve", SYSTEM, prompt, GeneratedPost, user=state.get("user"))
    return {"post": res.data, "revisions": state.get("revisions", 0) + 1, "provider": res.provider, "model": res.model}


def _route(state: ContentState) -> str:
    return "revise" if not state["claims"]["passed"] and state.get("revisions", 0) < 1 else END


def build_graph():
    g = StateGraph(ContentState)
    g.add_node("generate", _generate)
    g.add_node("claim_check", _check)
    g.add_node("revise", _revise)
    g.set_entry_point("generate")
    g.add_edge("generate", "claim_check")
    g.add_conditional_edges("claim_check", _route, {"revise": "revise", END: END})
    g.add_edge("revise", "claim_check")
    return g.compile()


content_graph = build_graph()


async def generate_post(user, achievement: dict, tone: str, language: str, extra: str = "") -> ContentState:
    return await content_graph.ainvoke({"user": user, "achievement": achievement, "tone": tone, "language": language, "extra": extra})


IMPROVE_SYSTEM = (
    "You improve the clarity, structure and wording of a user's own LinkedIn draft. Keep every fact, add none. "
    "Keep the same language as the draft unless asked otherwise. " + UNTRUSTED_RULES
)


async def improve_post(user, draft: str, tone: str, language: str) -> tuple[GeneratedPost, dict, str]:
    safe, _ = sanitize_untrusted(draft, 4000)
    lang = "Arabic" if language == "ar" else "English"
    prompt = f"Improve this draft in {lang} with a {TONE_GUIDE.get(tone, TONE_GUIDE['professional'])} tone.\n{wrap('draft', safe)}"
    res = await run_structured("post_improve", IMPROVE_SYSTEM, prompt, GeneratedPost, user=user)
    return res.data, check_claims(res.data.content, safe), res.provider
