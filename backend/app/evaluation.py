"""Offline evaluation of Wasl's AI workflows against eval/dataset.json using the REAL configured providers.

Run:  python -m app.evaluation            (from backend/, with provider keys in .env)
Writes: eval/results/<timestamp>.json, eval/results/latest.md and an eval_runs row shown on the dashboard.

Scores are computed by explicit rules below. If no provider is configured the run aborts —
we never produce placeholder numbers.
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.ai.claims import check_claims
from app.ai.providers.registry import platform_providers
from app.ai.router import AIUnavailableError
from app.ai.skills import canonical
from app.ai.workflows.career import run_career
from app.ai.workflows.content import evidence_text, generate_post
from app.ai.workflows.discovery import discover
from app.db import SessionLocal, init_db
from app.models import AIEvent, EvalRun

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"
_AR = re.compile(r"[؀-ۿ]")


def _has_kw(text: str, options: list[str]) -> bool:
    t = text.lower()
    return any(o.lower() in t for o in options)


async def eval_extraction(case: dict) -> dict:
    st = await discover(None, case.get("source_type", "manual"), case["id"], case["text"], [])
    cands = st["candidates"]
    exp = case["expect"]
    checks: dict[str, bool] = {"count_in_range": exp["min"] <= len(cands) <= exp["max"]}
    joined = " ".join(c["title"] + " " + c["description"] for c in cands)
    for i, kws in enumerate(exp.get("title_keywords", [])):
        checks[f"finds_achievement_{i + 1}"] = _has_kw(joined, kws)
    got_skills = {canonical(s).lower() for c in cands for s in c["technologies"] + c["skills"]}
    exp_skills = {canonical(s).lower() for s in exp.get("skills", [])}
    tp = len(got_skills & exp_skills)
    if exp_skills:
        checks["skill_recall_ge_0.5"] = tp / len(exp_skills) >= 0.5
    if "max_confidence_if_any" in exp and cands:
        checks["low_confidence_on_ambiguous"] = max(c["confidence"] for c in cands) <= exp["max_confidence_if_any"]
    if exp.get("forbidden"):
        everything = json.dumps(cands, ensure_ascii=False).lower()
        checks["no_injected_claims"] = not any(f in everything for f in exp["forbidden"])
    if exp.get("must_need_confirmation"):
        checks["asks_contribution"] = all(c["needs_contribution_confirmation"] for c in cands) if cands else False
    quotes = [e for c in cands for e in c["evidence"] if "quote" in e]
    unverified = sum(c.get("unverified_quotes", 0) for c in cands)
    return {"checks": checks, "n_candidates": len(cands), "skills_tp": tp, "skills_expected": len(exp_skills),
            "skills_predicted": len(got_skills), "verified_quotes": len(quotes), "unverified_quotes": unverified,
            "injection_flags": st.get("injection_flags", [])}


async def eval_post(case: dict) -> dict:
    st = await generate_post(None, case["achievement"], case["tone"], case["language"])
    content = st["post"].content
    final = check_claims(content, evidence_text(case["achievement"]))
    exp = case["expect"]
    ar_ratio = len(_AR.findall(content)) / max(1, len(re.sub(r"\s", "", content)))
    checks = {
        "no_unsupported_claims": final["unsupported_count"] <= exp["max_unsupported"],
        "correct_language": ar_ratio > 0.5 if exp["language"] == "ar" else ar_ratio < 0.05,
        "reasonable_length": 80 <= len(content) <= 3000,
    }
    if exp.get("no_numbers"):
        checks["no_invented_numbers"] = not any(u["type"] == "number" for u in final["unsupported"])
    first_pass_unsupported = st["claims"]["unsupported_count"] if st.get("revisions", 0) == 0 else None
    return {"checks": checks, "claims_checked": final["claims_checked"], "unsupported": final["unsupported_count"],
            "unsupported_items": final["unsupported"], "revisions": st.get("revisions", 0), "first_pass_unsupported": first_pass_unsupported}


async def eval_career(case: dict, fixtures: dict, mode: str) -> dict:
    cv = fixtures[case["cv"]]
    st = await run_career(None, mode, case["job"], cv, [])
    exp = case["expect"]
    statuses = {m["skill"].lower(): m["status"] for m in st["must"] + st["nice"]}
    checks: dict[str, bool] = {}
    n_req = len(st["must"]) + len(st["nice"])
    if "min_requirements" in exp:
        checks["requirements_extracted"] = n_req >= exp["min_requirements"]
    for s in exp.get("expected_verified", []):
        checks[f"verified:{s}"] = statuses.get(canonical(s).lower()) == "verified"
    for s in exp.get("expected_unverified", []):
        checks[f"unverified:{s}"] = statuses.get(canonical(s).lower()) == "unverified"
    if exp.get("expected_missing_any"):
        checks["detects_missing"] = any(statuses.get(canonical(s).lower()) == "missing" for s in exp["expected_missing_any"])
    if "max_score" in exp:
        checks["low_score_for_mismatch"] = st["score"]["score"] <= exp["max_score"]
    out = {"checks": checks, "score": st["score"]["score"], "requirements": n_req}
    if mode == "tailor":
        tailored = st["tailored_cv"]
        if exp.get("no_new_skills"):
            checks["no_new_skills"] = {s.lower() for s in tailored["skills"]} <= {s.lower() for s in cv["skills"]}
        ids_ok = {e["id"] for e in tailored["experience"]} == {e["id"] for e in cv["experience"]}
        checks["no_new_items"] = ids_ok and len(tailored["projects"]) == len(cv["projects"])
        enf = st["enforcement"]
        out.update({"claims_checked": enf["claims_checked"], "unsupported_before_enforcement": enf["unsupported_found"],
                    "rejected_bullets": enf["rejected_bullets"], "accepted_bullets": enf["accepted_bullets"]})
    else:
        checks["roadmap_has_steps"] = len(st["roadmap"].steps) >= exp.get("min_steps", 1)
    return out


async def run(limit: int | None = None) -> dict:
    init_db()
    providers = platform_providers()
    if not providers or providers == ["fake"]:
        raise SystemExit("No real AI provider configured (set GROQ_API_KEY or GEMINI_API_KEY in backend/.env). Evaluation not run.")
    data = json.loads((EVAL_DIR / "dataset.json").read_text(encoding="utf-8"))
    started = datetime.now(UTC)
    results = []
    for case in data["cases"][:limit]:
        t0 = datetime.now(UTC)
        try:
            if case["task"] == "extraction":
                r = await eval_extraction(case)
            elif case["task"] == "post":
                r = await eval_post(case)
            else:
                r = await eval_career(case, data["fixtures"], "tailor" if case["task"] == "tailor" else "gap")
            r["error"] = None
        except AIUnavailableError as exc:
            r = {"checks": {}, "error": exc.reason}
        r.update({"id": case["id"], "task": case["task"], "type": case["type"], "seconds": round((datetime.now(UTC) - t0).total_seconds(), 1)})
        r["passed"] = bool(r["checks"]) and all(r["checks"].values()) and not r["error"]
        results.append(r)
        print(f"{case['id']:<10} {'PASS' if r['passed'] else 'FAIL'}  {r.get('error') or {k: v for k, v in r['checks'].items() if not v}}")
        await asyncio.sleep(1.5)  # stay well under free-tier rate limits

    summary = summarise(results)
    db = SessionLocal()
    try:
        used = db.query(AIEvent.provider, AIEvent.model).filter(AIEvent.created_at >= started, AIEvent.status == "success").distinct().all()
        prov = ", ".join(sorted({p for p, _ in used})) or ",".join(providers)
        model = ", ".join(sorted({m for _, m in used}))
        row = EvalRun(dataset_version=data["version"], provider=prov, model=model, summary=summary, cases=results)
        db.add(row)
        db.commit()
    finally:
        db.close()
    out_dir = EVAL_DIR / "results"
    out_dir.mkdir(exist_ok=True)
    stamp = started.strftime("%Y%m%d-%H%M%S")
    (out_dir / f"{stamp}.json").write_text(json.dumps({"summary": summary, "provider": prov, "model": model, "cases": results}, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "latest.md").write_text(report_md(data["version"], prov, model, summary, results, started), encoding="utf-8")
    return summary


def summarise(results: list[dict]) -> dict:
    def rate(xs):
        return round(sum(xs) / len(xs), 3) if xs else None

    ext = [r for r in results if r["task"] == "extraction" and not r["error"]]
    pos = [r for r in ext if r["type"] in ("positive", "positive_ar", "repository", "adversarial")]
    neg = [r for r in ext if r["type"] == "negative"]
    tp = sum(r["skills_tp"] for r in ext)
    pred = sum(r["skills_predicted"] for r in ext)
    gold = sum(r["skills_expected"] for r in ext)
    posts = [r for r in results if r["task"] == "post" and not r["error"]]
    tail = [r for r in results if r["task"] == "tailor" and not r["error"]]
    claims_checked = sum(r.get("claims_checked", 0) for r in posts)
    unsupported = sum(r.get("unsupported", 0) for r in posts)
    return {
        "cases": len(results),
        "errors": sum(1 for r in results if r["error"]),
        "task_success_rate": rate([r["passed"] for r in results]),
        "by_task": {t: rate([r["passed"] for r in results if r["task"] == t]) for t in ("extraction", "post", "tailor", "gap")},
        "extraction_case_accuracy": rate([r["passed"] for r in ext]),
        "extraction_skill_precision": round(tp / pred, 3) if pred else None,
        "extraction_skill_recall": round(tp / gold, 3) if gold else None,
        "positive_detection_rate": rate([r["n_candidates"] > 0 for r in pos]),
        "negative_false_positive_rate": rate([r["n_candidates"] > 0 for r in neg]),
        "evidence_quote_verification_rate": round(sum(r["verified_quotes"] for r in ext) / max(1, sum(r["verified_quotes"] + r["unverified_quotes"] for r in ext)), 3) if ext else None,
        "post_unsupported_claim_rate": round(unsupported / claims_checked, 3) if claims_checked else 0.0,
        "posts_revised": sum(1 for r in posts if r.get("revisions")),
        "tailor_unsupported_before_enforcement": sum(r.get("unsupported_before_enforcement", 0) for r in tail),
        "tailor_claims_checked": sum(r.get("claims_checked", 0) for r in tail),
        "tailor_no_invention_rate": rate([r["checks"].get("no_new_skills", False) and r["checks"].get("no_new_items", False) for r in tail]),
    }


def report_md(version, prov, model, s, results, started) -> str:
    lines = [f"# Wasl evaluation — {version}", "", f"Run: {started.isoformat()}  ", f"Provider(s): {prov}  ", f"Model(s): {model}", "",
             "## Summary", "", "| Metric | Value |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in s.items() if not isinstance(v, dict)]
    lines += [f"| success rate: {k} | {v} |" for k, v in s["by_task"].items()]
    lines += ["", "## Cases", "", "| Case | Task | Type | Result | Failed checks |", "|---|---|---|---|---|"]
    for r in results:
        failed = r["error"] or ", ".join(k for k, v in r["checks"].items() if not v) or "—"
        lines.append(f"| {r['id']} | {r['task']} | {r['type']} | {'PASS' if r['passed'] else 'FAIL'} | {failed} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    print(json.dumps(asyncio.run(run(lim)), indent=2))
