
"""Offline evaluation of Wasl's AI workflows against eval/dataset.json using real providers.

Run from backend/:
    python -m app.evaluation

Writes:
    eval/results/<timestamp>.json
    eval/results/latest.md
    An eval_runs database row displayed on the dashboard.

Scores are computed using explicit rules. If no real provider is configured,
the evaluation aborts instead of producing placeholder numbers.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import UTC, datetime
from pathlib import Path

from app.ai.claims import VERIFIER_VERSION, check_claims
from app.ai.providers.registry import platform_providers
from app.ai.router import AIUnavailableError
from app.ai.skills import canonical
from app.ai.workflows.career import run_career
from app.ai.workflows.content import evidence_text, generate_post
from app.ai.workflows.discovery import discover
from app.config import settings
from app.db import SessionLocal, init_db
from app.models import AIEvent, EvalRun

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"
_AR = re.compile(r"[؀-ۿ]")


def _has_kw(text: str, options: list[str]) -> bool:
    text = text.lower()
    return any(option.lower() in text for option in options)


async def eval_extraction(case: dict) -> dict:
    result = await discover(
        None,
        case.get("source_type", "manual"),
        case["id"],
        case["text"],
        [],
    )
    candidates = result["candidates"]
    expected = case["expect"]

    checks: dict[str, bool] = {
        "count_in_range": expected["min"] <= len(candidates) <= expected["max"]
    }

    joined = " ".join(
        candidate["title"] + " " + candidate["description"]
        for candidate in candidates
    )

    for index, keywords in enumerate(expected.get("title_keywords", [])):
        checks[f"finds_achievement_{index + 1}"] = _has_kw(joined, keywords)

    predicted_skills = {
        canonical(skill).lower()
        for candidate in candidates
        for skill in candidate["technologies"] + candidate["skills"]
    }
    expected_skills = {
        canonical(skill).lower()
        for skill in expected.get("skills", [])
    }

    true_positives = len(predicted_skills & expected_skills)

    if expected_skills:
        checks["skill_recall_ge_0.5"] = (
            true_positives / len(expected_skills) >= 0.5
        )

    if "max_confidence_if_any" in expected and candidates:
        checks["low_confidence_on_ambiguous"] = (
            max(candidate["confidence"] for candidate in candidates)
            <= expected["max_confidence_if_any"]
        )

    if expected.get("forbidden"):
        all_candidates = json.dumps(
            candidates, ensure_ascii=False
        ).lower()
        checks["no_injected_claims"] = not any(
            phrase in all_candidates for phrase in expected["forbidden"]
        )

    if expected.get("must_need_confirmation"):
        checks["asks_contribution"] = (
            all(candidate["needs_contribution_confirmation"]
                for candidate in candidates)
            if candidates
            else False
        )

    quotes = [
        evidence
        for candidate in candidates
        for evidence in candidate["evidence"]
        if "quote" in evidence
    ]
    unverified = sum(
        candidate.get("unverified_quotes", 0)
        for candidate in candidates
    )

    return {
        "checks": checks,
        "n_candidates": len(candidates),
        "skills_tp": true_positives,
        "skills_expected": len(expected_skills),
        "skills_predicted": len(predicted_skills),
        "verified_quotes": len(quotes),
        "unverified_quotes": unverified,
        "injection_flags": result.get("injection_flags", []),
    }


async def eval_post(case: dict) -> dict:
    result = await generate_post(
        None,
        case["achievement"],
        case["tone"],
        case["language"],
    )

    content = result["post"].content
    claims = check_claims(content, evidence_text(case["achievement"]))
    expected = case["expect"]

    arabic_ratio = len(_AR.findall(content)) / max(
        1, len(re.sub(r"\s", "", content))
    )

    checks = {
        "no_unsupported_claims": (
            claims["unsupported_count"] <= expected["max_unsupported"]
        ),
        "correct_language": (
            arabic_ratio > 0.5
            if expected["language"] == "ar"
            else arabic_ratio < 0.05
        ),
        "reasonable_length": 80 <= len(content) <= 3000,
    }

    if expected.get("no_numbers"):
        checks["no_invented_numbers"] = not any(
            item["type"] == "number"
            for item in claims["unsupported"]
        )

    raw = result.get("raw_claims") or result["claims"]
    first_pass_unsupported = raw["unsupported_count"]

    return {
        "checks": checks,
        "claims_checked": claims["claims_checked"],
        "unsupported": claims["unsupported_count"],
        "unsupported_items": claims["unsupported"],
        "revisions": result.get("revisions", 0),
        "first_pass_unsupported": first_pass_unsupported,
        "raw_claims_checked": raw["claims_checked"],
    }


async def eval_career(case: dict, fixtures: dict, mode: str) -> dict:
    cv = fixtures[case["cv"]]
    result = await run_career(None, mode, case["job"], cv, [])
    expected = case["expect"]

    statuses = {
        item["skill"].lower(): item["status"]
        for item in result["must"] + result["nice"]
    }

    checks: dict[str, bool] = {}
    requirement_count = len(result["must"]) + len(result["nice"])

    if "min_requirements" in expected:
        checks["requirements_extracted"] = (
            requirement_count >= expected["min_requirements"]
        )

    for skill in expected.get("expected_verified", []):
        checks[f"verified:{skill}"] = (
            statuses.get(canonical(skill).lower()) == "verified"
        )

    for skill in expected.get("expected_unverified", []):
        checks[f"unverified:{skill}"] = (
            statuses.get(canonical(skill).lower()) == "unverified"
        )

    if expected.get("expected_missing_any"):
        checks["detects_missing"] = any(
            statuses.get(canonical(skill).lower()) == "missing"
            for skill in expected["expected_missing_any"]
        )

    if "max_score" in expected:
        checks["low_score_for_mismatch"] = (
            result["score"]["score"] <= expected["max_score"]
        )

    output = {
        "checks": checks,
        "score": result["score"]["score"],
        "requirements": requirement_count,
    }

    if mode == "tailor":
        tailored = result["tailored_cv"]

        if expected.get("no_new_skills"):
            checks["no_new_skills"] = (
                {skill.lower() for skill in tailored["skills"]}
                <= {skill.lower() for skill in cv["skills"]}
            )

        same_experience_ids = (
            {item["id"] for item in tailored["experience"]}
            == {item["id"] for item in cv["experience"]}
        )
        checks["no_new_items"] = (
            same_experience_ids
            and len(tailored["projects"]) == len(cv["projects"])
        )

        enforcement = result["enforcement"]
        output.update({
            "claims_checked": enforcement["claims_checked"],
            "unsupported_before_enforcement": enforcement["unsupported_found"],
            "rejected_bullets": enforcement["rejected_bullets"],
            "accepted_bullets": enforcement["accepted_bullets"],
        })
    else:
        checks["roadmap_has_steps"] = (
            len(result["roadmap"].steps) >= expected.get("min_steps", 1)
        )

    return output


class BudgetExceeded(Exception):
    pass


def _calls_since(started: datetime) -> int:
    db = SessionLocal()
    try:
        return db.query(AIEvent).filter(AIEvent.created_at >= started, AIEvent.provider != "none").count()
    finally:
        db.close()


def _v2_generation_cases() -> list[dict]:
    """Live generation on the v2 adversarial evidence (LinkedIn + hallucination files): the REAL model writes a
    post from evidence that invites inflation; we measure raw (first draft) and final unsupported-claim rates."""
    out = []
    for name in ("linkedin_content.json", "hallucination.json"):
        f = EVAL_DIR / "v2" / name
        if not f.exists():
            continue
        for c in json.loads(f.read_text(encoding="utf-8"))["cases"]:
            if c.get("kind") == "claim_check":
                out.append({"id": "live-" + c["id"], "task": "post", "type": "v2_" + c["category"], "tone": "professional",
                            "language": "ar" if c.get("lang") == "ar" else "en",
                            "achievement": {"title": "", "description": c["input"]["evidence"]},
                            "expect": {"max_unsupported": 0, "language": "ar" if c.get("lang") == "ar" else "en"}})
    return out


async def run(limit: int | None = None, *, max_calls: int = 60, v2_generation: int = 20, kind: str = "live",
              provider_only: str | None = None) -> dict:
    init_db()
    if provider_only:
        settings.ai_provider_priority = provider_only  # benchmark: route everything to one provider

    providers = platform_providers()
    if not providers or providers == ["fake"]:
        raise SystemExit(
            "No real AI provider configured "
            "(set GROQ_API_KEY or GEMINI_API_KEY in backend/.env). "
            "Evaluation not run."
        )

    data = json.loads(
        (EVAL_DIR / "dataset.json").read_text(encoding="utf-8")
    )
    started = datetime.now(UTC)
    results = []
    cases = data["cases"][:limit] + _v2_generation_cases()[:v2_generation]

    for case in cases:
        if _calls_since(started) >= max_calls:
            print(f"budget of {max_calls} provider calls reached — stopping (remaining cases not run)")
            break
        start_case = datetime.now(UTC)

        try:
            if case["task"] == "extraction":
                result = await eval_extraction(case)
            elif case["task"] == "post":
                result = await eval_post(case)
            else:
                result = await eval_career(
                    case,
                    data["fixtures"],
                    "tailor" if case["task"] == "tailor" else "gap",
                )

            result["error"] = None

        except AIUnavailableError as exc:
            result = {"checks": {}, "error": exc.reason}

        result.update({
            "id": case["id"],
            "task": case["task"],
            "type": case["type"],
            "seconds": round(
                (datetime.now(UTC) - start_case).total_seconds(), 1
            ),
        })

        result["passed"] = (
            bool(result["checks"])
            and all(result["checks"].values())
            and not result["error"]
        )
        results.append(result)

        failed_checks = {
            key: value
            for key, value in result["checks"].items()
            if not value
        }
        print(
            f"{case['id']:<10} "
            f"{'PASS' if result['passed'] else 'FAIL'}  "
            f"{result.get('error') or failed_checks}"
        )

        await asyncio.sleep(1.5)

    summary = summarise(results)
    db = SessionLocal()

    try:
        used = (
            db.query(AIEvent.provider, AIEvent.model)
            .filter(
                AIEvent.created_at >= started,
                AIEvent.status == "success",
            )
            .distinct()
            .all()
        )

        provider = ", ".join(sorted({p for p, _ in used})) or ",".join(providers)
        model = ", ".join(sorted({m for _, m in used})) or "unavailable (no successful call)"
        attempts = db.query(AIEvent).filter(AIEvent.created_at >= started, AIEvent.provider != "none").all()
        lat = sorted(e.latency_ms for e in attempts if e.status == "success")
        summary["provider_calls"] = len(attempts)
        summary["budget_max_calls"] = max_calls
        summary["tokens"] = sum(e.prompt_tokens + e.completion_tokens for e in attempts)
        costs = [e.est_cost_usd for e in attempts if e.est_cost_usd is not None]
        summary["est_cost_usd"] = round(sum(costs), 6) if costs else None
        summary["p50_latency_ms"] = lat[len(lat) // 2] if lat else None
        summary["p95_latency_ms"] = lat[min(len(lat) - 1, int(len(lat) * 0.95))] if lat else None
        summary["privacy_blocked"] = sum(1 for r in results if r.get("error") and "privacy" in r["error"])
        summary["verifier_version"] = VERIFIER_VERSION

        row = EvalRun(
            dataset_version=data["version"] + "+v2gen",
            provider=provider,
            model=model[:200],
            kind=kind,
            verifier_version=VERIFIER_VERSION,
            summary=summary,
            cases=results,
        )
        db.add(row)
        db.commit()

    finally:
        db.close()

    output_dir = EVAL_DIR / "results"
    output_dir.mkdir(exist_ok=True)
    stamp = started.strftime("%Y%m%d-%H%M%S")

    report_data = {
        "summary": summary,
        "provider": provider,
        "model": model,
        "cases": results,
    }

    (output_dir / f"{stamp}.json").write_text(
        json.dumps(report_data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    (output_dir / "latest.md").write_text(
        report_md(data["version"], provider, model, summary, results, started),
        encoding="utf-8",
    )

    return summary


def summarise(results: list[dict]) -> dict:
    def rate(values):
        return round(sum(values) / len(values), 3) if values else None

    extraction = [
        result for result in results
        if result["task"] == "extraction" and not result["error"]
    ]
    positive = [
        result for result in extraction
        if result["type"] in (
            "positive", "positive_ar", "repository", "adversarial"
        )
    ]
    negative = [
        result for result in extraction if result["type"] == "negative"
    ]

    true_positives = sum(result["skills_tp"] for result in extraction)
    predicted = sum(result["skills_predicted"] for result in extraction)
    expected = sum(result["skills_expected"] for result in extraction)

    posts = [
        result for result in results
        if result["task"] == "post" and not result["error"]
    ]
    tailored = [
        result for result in results
        if result["task"] == "tailor" and not result["error"]
    ]

    claims_checked = sum(result.get("claims_checked", 0) for result in posts)
    unsupported = sum(result.get("unsupported", 0) for result in posts)

    return {
        "cases": len(results),
        "errors": sum(1 for result in results if result["error"]),
        "task_success_rate": rate([r["passed"] for r in results]),
        "by_task": {
            task: rate([
                r["passed"] for r in results if r["task"] == task
            ])
            for task in ("extraction", "post", "tailor", "gap")
        },
        "extraction_case_accuracy": rate(
            [result["passed"] for result in extraction]
        ),
        "extraction_skill_precision": (
            round(true_positives / predicted, 3) if predicted else None
        ),
        "extraction_skill_recall": (
            round(true_positives / expected, 3) if expected else None
        ),
        "positive_detection_rate": rate(
            [result["n_candidates"] > 0 for result in positive]
        ),
        "negative_false_positive_rate": rate(
            [result["n_candidates"] > 0 for result in negative]
        ),
        "evidence_quote_verification_rate": (
            round(
                sum(r["verified_quotes"] for r in extraction)
                / max(1, sum(
                    r["verified_quotes"] + r["unverified_quotes"]
                    for r in extraction
                )),
                3,
            )
            if extraction else None
        ),
        # final = after the revise loop (what users get); raw = the model's first draft.
        # None (not 0.0) when no claims were checked — zero checks is not evidence of quality.
        "post_unsupported_claim_rate": (
            round(unsupported / claims_checked, 3)
            if claims_checked else None
        ),
        "post_raw_unsupported_claim_rate": (
            round(sum(r.get("first_pass_unsupported") or 0 for r in posts) / raw_checked, 3)
            if (raw_checked := sum(r.get("raw_claims_checked", 0) for r in posts)) else None
        ),
        "post_claims_checked": claims_checked,
        "posts_revised": sum(
            1 for result in posts if result.get("revisions")
        ),
        "tailor_unsupported_before_enforcement": sum(
            result.get("unsupported_before_enforcement", 0)
            for result in tailored
        ),
        "tailor_claims_checked": sum(
            result.get("claims_checked", 0) for result in tailored
        ),
        "tailor_no_invention_rate": rate([
            result["checks"].get("no_new_skills", False)
            and result["checks"].get("no_new_items", False)
            for result in tailored
        ]),
    }


def report_md(
    version: str,
    provider: str,
    model: str,
    summary: dict,
    results: list[dict],
    started: datetime,
) -> str:
    lines = [
        f"# Wasl evaluation — {version}",
        "",
        f"Run: {started.isoformat()}",
        f"Provider(s): {provider}",
        f"Model(s): {model}",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "|---|---|",
    ]

    lines += [
        f"| {key} | {value} |"
        for key, value in summary.items()
        if not isinstance(value, dict)
    ]
    lines += [
        f"| success rate: {key} | {value} |"
        for key, value in summary["by_task"].items()
    ]
    lines += [
        "",
        "## Cases",
        "",
        "| Case | Task | Type | Result | Failed checks |",
        "|---|---|---|---|---|",
    ]

    for result in results:
        failed = (
            result["error"]
            or ", ".join(
                key for key, value in result["checks"].items() if not value
            )
            or "—"
        )
        lines.append(
            f"| {result['id']} | {result['task']} | {result['type']} | "
            f"{'PASS' if result['passed'] else 'FAIL'} | {failed} |"
        )

    return "\n".join(lines) + "\n"


async def benchmark(max_calls: int) -> dict:
    """Same cases on each configured provider separately (budget split evenly). Writes eval/results/benchmark-latest.md."""
    order = [p for p in settings.provider_priority() if p in platform_providers()]
    if not order:
        raise SystemExit("No real AI provider configured. Benchmark not run.")
    per = max(1, max_calls // len(order))
    rows = {}
    original = settings.ai_provider_priority
    try:
        for p in order:
            print(f"--- benchmark: {p} (budget {per} calls)")
            rows[p] = await run(None, max_calls=per, v2_generation=8, kind="benchmark", provider_only=p)
    finally:
        settings.ai_provider_priority = original
    keys = ["cases", "errors", "task_success_rate", "extraction_case_accuracy", "evidence_quote_verification_rate",
            "post_raw_unsupported_claim_rate", "post_unsupported_claim_rate", "tailor_no_invention_rate", "provider_calls",
            "tokens", "est_cost_usd", "p50_latency_ms", "p95_latency_ms", "privacy_blocked"]
    md = ["# Provider benchmark", "", "Same cases per provider; personal-data tasks respect the privacy policy (blocked = not eligible).", "",
          "| Metric | " + " | ".join(order) + " |", "|---|" + "---|" * len(order)]
    for k in keys:
        md.append(f"| {k} | " + " | ".join(str(rows[p].get(k)) for p in order) + " |")
    (EVAL_DIR / "results" / "benchmark-latest.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return rows


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Live evaluation against REAL providers (bounded by --max-calls).")
    ap.add_argument("limit", nargs="?", type=int, default=None, help="max v1 cases")
    ap.add_argument("--max-calls", type=int, default=60)
    ap.add_argument("--v2-generation", type=int, default=20, help="how many v2 adversarial evidence cases to generate posts for")
    ap.add_argument("--benchmark", action="store_true")
    args = ap.parse_args()
    if args.benchmark:
        print(json.dumps(asyncio.run(benchmark(args.max_calls)), indent=2, default=str))
    else:
        print(json.dumps(asyncio.run(run(args.limit, max_calls=args.max_calls, v2_generation=args.v2_generation)), indent=2))
