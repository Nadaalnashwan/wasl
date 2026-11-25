"""Deterministic evaluation suite v2 (no LLM, no network) — runs on every push in CI.

    python -m app.eval_v2                 # run all cases, write eval/results/deterministic-latest.{json,md}
    python -m app.eval_v2 --record        # also store an eval_runs row (kind=deterministic)
    python -m app.eval_v2 --fail-under 0  # exit 1 if any category's pass rate drops below the baseline file

What it measures: the parts of Wasl that decide whether AI output is trustworthy — claim verification, CV
tailoring enforcement, achievement evidence verification, PII redaction, prompt-injection redaction, skill
matching and the provider privacy policy. Each case feeds a FIXED, hand-written adversarial "model output" (or
document) into the real production code path and compares the result with a ground-truth expectation written
by a human. Nothing here calls a model, so these numbers are NOT live AI quality — see app/evaluation.py for
the live-provider run. Expectations are ground truth: when the system disagrees, the case fails and is reported;
expectations are never edited to make the system pass.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

from app.ai.claims import VERIFIER_VERSION, check_claims
from app.ai.model_registry import TASKS as REGISTRY_TASKS
from app.ai.model_registry import privacy_ok, provider_privacy
from app.ai.schemas import AchievementExtraction, CVData, JobRequirements, TailoredCV
from app.ai.skills import match_requirements
from app.ai.workflows.career import _enforce, cv_text
from app.ai.workflows.discovery import _verify
from app.security.guard import sanitize_untrusted
from app.security.pii import Redactor

EVAL_DIR = Path(__file__).resolve().parent.parent / "eval"
DATA_DIR = EVAL_DIR / "v2"
RESULTS = EVAL_DIR / "results"
DATASET_VERSION = "wasl-eval-v2.1"
# dev = regression set used while building the safeguards; heldout = frozen set never used for tuning
DATASETS = {"dev": (EVAL_DIR / "v2", "wasl-eval-v2.1", "deterministic-latest"),
            "heldout": (EVAL_DIR / "heldout", "wasl-heldout-1.0", "deterministic-heldout-latest"),
            "heldout2": (EVAL_DIR / "heldout2", "wasl-heldout-2.0", "deterministic-heldout2-latest"),
            "heldout3": (EVAL_DIR / "heldout3", "wasl-heldout-3.0", "deterministic-heldout3-latest")}
CATEGORIES = ["cv_parsing", "achievement_extraction", "linkedin_content", "cv_tailoring", "hallucination",
              "prompt_injection", "arabic_mixed", "privacy"]


def load_cases() -> list[dict]:
    cases: list[dict] = []
    for f in sorted(DATA_DIR.glob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for c in data["cases"]:
            c["_file"] = f.name
            cases.append(c)
    ids = Counter(c["id"] for c in cases)
    dup = [i for i, n in ids.items() if n > 1]
    if dup:
        raise SystemExit(f"duplicate case ids: {dup}")
    return cases


# ----------------------------------------------------------------------------- runners
def _claim_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    rep = check_claims(i["output"], i["evidence"], contribution_confirmed=i.get("contribution_confirmed"))
    checks: dict[str, bool] = {"passed_matches": rep["passed"] == e["passed"]}
    claims = rep["claims"]
    for k, f in enumerate(e.get("flagged", [])):
        hits = [c for c in claims if f["value_contains"].lower() in (c["value"] + " " + c["text"]).lower() and c["status"] != "supported"]
        if "status" in f:
            hits = [c for c in hits if c["status"] == f["status"] or (f["status"] == "unsupported" and c["status"] in ("unsupported", "contradicted"))]
        checks[f"flags_{k + 1}:{f['value_contains']}"] = bool(hits)
        if f.get("reason"):
            checks[f"reason_{k + 1}:{f['reason']}"] = any(f["reason"] in c["reasons"] for c in hits)
    for k, v in enumerate(e.get("supported", [])):
        checks[f"supported_{k + 1}:{v}"] = not any(v.lower() in c["value"].lower() and c["status"] != "supported" for c in claims)
    return {"checks": checks, "predicted_pass": rep["passed"], "expected_pass": e["passed"],
            "statuses": dict(Counter(c["status"] for c in claims)), "claims_checked": rep["claims_checked"]}


def _tailor_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    cv = CVData.model_validate(i["cv"]).model_dump()
    state = {"cv": cv, "achievements": i.get("achievements", []), "tailored_raw": TailoredCV.model_validate(i["model_output"]),
             "requirements": JobRequirements(job_title="eval")}
    out = _enforce(state)
    final, enf = out["tailored_cv"], out["enforcement"]
    final_text = cv_text(final).lower()
    checks: dict[str, bool] = {
        "no_new_skills": set(s.lower() for s in final["skills"]) <= set(s.lower() for s in cv["skills"]),
        "no_unsupported_after_enforcement": enf["unsupported_after_enforcement"] == 0,
    }
    if "rejected_bullets_min" in e:
        checks["rejected_bullets_min"] = enf["rejected_bullets"] >= e["rejected_bullets_min"]
    if "rejected_bullets_max" in e:
        checks["rejected_bullets_max"] = enf["rejected_bullets"] <= e["rejected_bullets_max"]
    if "accepted_bullets_min" in e:
        checks["accepted_bullets_min"] = enf["accepted_bullets"] >= e["accepted_bullets_min"]
    if "summary_kept_original" in e:
        checks["summary_kept_original"] = (final["summary"] == cv["summary"]) == e["summary_kept_original"]
    for s in e.get("must_not_contain", []):
        checks[f"absent:{s}"] = s.lower() not in final_text
    for s in e.get("must_contain", []):
        checks[f"present:{s}"] = s.lower() in final_text
    return {"checks": checks, "rejected": enf["rejected_bullets"], "accepted": enf["accepted_bullets"],
            "raw_unsupported": enf["unsupported_found"], "claims_checked": enf["claims_checked"]}


def _extraction_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    safe, flags = sanitize_untrusted(i["source_text"])
    st = {"safe_text": safe, "source_type": i.get("source_type", "manual"), "source_label": case["id"], "repo_meta": i.get("repo_meta") or {},
          "extraction": AchievementExtraction.model_validate(i["model_extraction"])}
    cands = _verify(st)["candidates"]
    checks: dict[str, bool] = {}
    if "n_candidates" in e:
        checks["n_candidates"] = len(cands) == e["n_candidates"]
    for k, exp in enumerate(e.get("candidates", [])):
        if k >= len(cands):
            checks[f"cand{k + 1}_exists"] = False
            continue
        c = cands[k]
        vq = sum(1 for ev in c["evidence"] if ev.get("quote"))
        if "verified_quotes" in exp:
            checks[f"cand{k + 1}_verified_quotes"] = vq == exp["verified_quotes"]
        if "unverified_quotes" in exp:
            checks[f"cand{k + 1}_unverified_quotes"] = c["unverified_quotes"] == exp["unverified_quotes"]
        for t in exp.get("dropped_include", []):
            checks[f"cand{k + 1}_dropped:{t}"] = t.lower() in [d.lower() for d in c["dropped_terms"]]
        for t in exp.get("kept_include", []):
            checks[f"cand{k + 1}_kept:{t}"] = t.lower() in [x.lower() for x in c["technologies"] + c["skills"]]
        if "needs_confirmation" in exp:
            checks[f"cand{k + 1}_needs_confirmation"] = c["needs_contribution_confirmation"] == exp["needs_confirmation"]
        if "max_confidence" in exp:
            checks[f"cand{k + 1}_max_confidence"] = c["confidence"] <= exp["max_confidence"]
    if "injection_flagged" in e:
        checks["injection_flagged"] = bool(flags) == e["injection_flagged"]
    return {"checks": checks, "n_candidates": len(cands)}


def _pii_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    r = Redactor(known_names=i.get("known_names", []), cv_header=i.get("document", False))
    red = r.redact(i["text"])
    checks: dict[str, bool] = {}
    for s in e.get("must_remove", []):
        checks[f"removed:{s}"] = s not in red
    for s in e.get("must_keep", []):
        checks[f"kept:{s}"] = s in red
    for k in e.get("kinds", []):
        checks[f"kind:{k}"] = k in r.counts_by_kind()
    checks["round_trip"] = r.restore(red) == i["text"]
    return {"checks": checks, "removed_expected": len(e.get("must_remove", [])),
            "removed_ok": sum(1 for s in e.get("must_remove", []) if s not in red),
            "kept_expected": len(e.get("must_keep", [])), "kept_ok": sum(1 for s in e.get("must_keep", []) if s in red)}


def _injection_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    safe, flags = sanitize_untrusted(i["text"])
    checks: dict[str, bool] = {"flagged": bool(flags) == e["flagged"]}
    for f in e.get("flags_include", []):
        checks[f"flag:{f}"] = f in flags
    for s in e.get("must_remove", []):
        checks[f"removed:{s}"] = s.lower() not in safe.lower()
    for s in e.get("must_keep", []):
        checks[f"kept:{s}"] = s.lower() in safe.lower()
    return {"checks": checks, "predicted_flag": bool(flags), "expected_flag": e["flagged"]}


def _skill_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    cv = CVData.model_validate(i["cv"]).model_dump()
    res = match_requirements([{"skill": s} for s in i["requirements"]], cv, i.get("achievements"))
    by = {r.skill.lower(): r.status for r in res}
    checks: dict[str, bool] = {}
    for status in ("verified", "unverified", "missing"):
        for s in e.get(status, []):
            checks[f"{status}:{s}"] = by.get(s.lower()) == status
    return {"checks": checks}


def _privacy_case(case: dict) -> dict:
    i, e = case["input"], case["expect"]
    level, _ = provider_privacy(i["provider"], i.get("key_source", "platform"))
    sensitivity = REGISTRY_TASKS[i["task"]].sensitivity
    return {"checks": {"eligible": privacy_ok(level, sensitivity) == e["eligible"]}, "level": level}


RUNNERS = {"claim_check": _claim_case, "tailor_enforce": _tailor_case, "extraction_verify": _extraction_case, "pii_redact": _pii_case,
           "injection": _injection_case, "skill_match": _skill_case, "privacy_policy": _privacy_case}


def run_all() -> list[dict]:
    results = []
    for c in load_cases():
        try:
            r = RUNNERS[c["kind"]](c)
            r["error"] = None
        except Exception as exc:  # noqa: BLE001 - a broken case is a failed case, never skipped
            r = {"checks": {"runner_error": False}, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}
        r.update(id=c["id"], category=c["category"], kind=c["kind"], lang=c.get("lang", "en"), purpose=c.get("purpose", ""))
        r["pass"] = all(r["checks"].values()) and not r["error"]
        r["failed_checks"] = [k for k, v in r["checks"].items() if not v]
        results.append(r)
    return results


def _rate(n: int, d: int) -> float | None:
    return round(n / d, 4) if d else None


def summarise(results: list[dict]) -> dict:
    by_cat = defaultdict(lambda: [0, 0])
    by_lang = defaultdict(lambda: [0, 0])
    for r in results:
        by_cat[r["category"]][0] += r["pass"]
        by_cat[r["category"]][1] += 1
        by_lang[r["lang"]][0] += r["pass"]
        by_lang[r["lang"]][1] += 1
    # claim verification confusion matrix: positive class = "text contains an unsupported claim" (should FAIL)
    claim = [r for r in results if r["kind"] == "claim_check" and not r["error"]]
    tp = sum(1 for r in claim if not r["expected_pass"] and not r["predicted_pass"])
    fn = sum(1 for r in claim if not r["expected_pass"] and r["predicted_pass"])
    fp = sum(1 for r in claim if r["expected_pass"] and not r["predicted_pass"])
    tn = sum(1 for r in claim if r["expected_pass"] and r["predicted_pass"])
    inj = [r for r in results if r["kind"] == "injection" and not r["error"]]
    pii = [r for r in results if r["kind"] == "pii_redact" and not r["error"]]
    tail = [r for r in results if r["kind"] == "tailor_enforce" and not r["error"]]
    # injection confusion matrix: positive class = "text contains an injection attempt" (should be flagged)
    itp = sum(1 for r in inj if r["expected_flag"] and r["predicted_flag"])
    ifn = sum(1 for r in inj if r["expected_flag"] and not r["predicted_flag"])
    ifp = sum(1 for r in inj if not r["expected_flag"] and r["predicted_flag"])
    itn = sum(1 for r in inj if not r["expected_flag"] and not r["predicted_flag"])
    precision = _rate(tp, tp + fp)
    recall = _rate(tp, tp + fn)
    ai_quality = [r for r in results if r["category"] != "privacy"]
    return {
        "dataset_version": DATASET_VERSION,
        "verifier_version": VERIFIER_VERSION,
        "cases": len(results),
        "errors": sum(1 for r in results if r["error"]),
        "case_pass_rate": _rate(sum(r["pass"] for r in results), len(results)),
        "ai_quality_case_pass_rate": _rate(sum(r["pass"] for r in ai_quality), len(ai_quality)),
        "by_category": {k: {"passed": v[0], "cases": v[1], "pass_rate": _rate(v[0], v[1])} for k, v in sorted(by_cat.items())},
        "by_language": {k: {"passed": v[0], "cases": v[1], "pass_rate": _rate(v[0], v[1])} for k, v in sorted(by_lang.items())},
        "claim_confusion": {"tp": tp, "fn": fn, "fp": fp, "tn": tn, "n": len(claim)},
        "claim_detection_precision": precision,
        "claim_detection_recall": recall,
        "claim_detection_f1": round(2 * precision * recall / (precision + recall), 4) if precision and recall else None,
        "false_acceptance_rate": _rate(fn, tp + fn),  # unsupported text the verifier let through
        "false_rejection_rate": _rate(fp, fp + tn),  # supported text the verifier blocked
        "contradiction_detection_rate": _rate(
            sum(1 for r in claim if any(k.startswith("flags_") for k in r["checks"]) and r["statuses"].get("contradicted") and r["pass"]),
            sum(1 for r in claim if r["statuses"].get("contradicted") is not None or "contradict" in r["purpose"].lower())),
        "tailor_post_enforcement_unsupported": sum(1 for r in tail if not r["checks"].get("no_unsupported_after_enforcement", True)),
        "tailor_raw_unsupported_claims": sum(r.get("raw_unsupported", 0) for r in tail),
        "tailor_claims_checked": sum(r.get("claims_checked", 0) for r in tail),
        "injection_detection_accuracy": _rate(sum(1 for r in inj if r["predicted_flag"] == r["expected_flag"]), len(inj)),
        "pii_recall": _rate(sum(r["removed_ok"] for r in pii), sum(r["removed_expected"] for r in pii)),
        "pii_preservation": _rate(sum(r["kept_ok"] for r in pii), sum(r["kept_expected"] for r in pii)),
        "injection_confusion": {"tp": itp, "fn": ifn, "fp": ifp, "tn": itn, "n": len(inj)},
        "injection_precision": _rate(itp, itp + ifp),
        "injection_recall": _rate(itp, itp + ifn),
        # PII counted per string: a false negative is a must_remove string that survived redaction, a false positive
        # is a must_keep (non-sensitive) string that redaction destroyed
        "pii_strings": {"must_remove": sum(r["removed_expected"] for r in pii), "false_negatives": sum(r["removed_expected"] - r["removed_ok"] for r in pii),
                        "must_keep": sum(r["kept_expected"] for r in pii), "false_positives": sum(r["kept_expected"] - r["kept_ok"] for r in pii)},
        "denominators": {
            "claim_detection_precision": "cases flagged by the verifier (tp+fp)",
            "claim_detection_recall": "cases whose ground truth contains an unsupported claim (tp+fn)",
            "false_acceptance_rate": "cases with an unsupported claim (tp+fn)",
            "false_rejection_rate": "fully-supported cases (fp+tn)",
            "injection_precision": "texts flagged by the guard (tp+fp)",
            "injection_recall": "texts that contain an injection attempt (tp+fn)",
            "pii_recall": "PII strings that must be removed",
            "pii_preservation": "task-relevant strings that must be kept",
            "case_pass_rate": "all cases; a case passes only if every one of its checks passes",
        },
    }


def _git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5, check=False).stdout.strip()  # noqa: S603,S607
    except Exception:  # noqa: BLE001
        return ""


def report_md(summary: dict, results: list[dict]) -> str:
    lines = [f"# Wasl deterministic evaluation — {summary['dataset_version']}", "",
             f"Verifier: `{summary['verifier_version']}` · Commit: `{summary.get('git_sha') or 'n/a'}` · Run: {summary['at']}", "",
             "No AI provider is called: each case runs a fixed adversarial input through the production verification, "
             "enforcement and redaction code. These are NOT live model-quality numbers.", "",
             "| Metric | Value |", "|---|---|"]
    for k in ("cases", "errors", "case_pass_rate", "ai_quality_case_pass_rate", "claim_detection_precision", "claim_detection_recall",
              "claim_detection_f1", "false_acceptance_rate", "false_rejection_rate", "tailor_post_enforcement_unsupported",
              "tailor_raw_unsupported_claims", "tailor_claims_checked", "injection_detection_accuracy", "pii_recall", "pii_preservation"):
        lines.append(f"| {k} | {summary[k] if summary[k] is not None else 'n/a'} |")
    for k in ("injection_precision", "injection_recall"):
        if k in summary:
            lines.append(f"| {k} | {summary[k] if summary[k] is not None else 'n/a'} |")
    for k in ("claim_confusion", "injection_confusion", "pii_strings"):
        if k in summary:
            lines.append(f"| {k} | {', '.join(f'{a}={b}' for a, b in summary[k].items())} |")
    lines += ["", "## By category", "", "| Category | Passed | Cases | Pass rate |", "|---|---|---|---|"]
    for k, v in summary["by_category"].items():
        lines.append(f"| {k} | {v['passed']} | {v['cases']} | {v['pass_rate']} |")
    lines += ["", "## By language", "", "| Language | Passed | Cases | Pass rate |", "|---|---|---|---|"]
    for k, v in summary["by_language"].items():
        lines.append(f"| {k} | {v['passed']} | {v['cases']} | {v['pass_rate']} |")
    failed = [r for r in results if not r["pass"]]
    lines += ["", f"## Failed cases ({len(failed)})", "", "| Case | Category | Failed checks / error |", "|---|---|---|"]
    for r in failed:
        lines.append(f"| {r['id']} | {r['category']} | {r['error'] or ', '.join(r['failed_checks'])} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--record", action="store_true", help="store an eval_runs row (kind=deterministic)")
    ap.add_argument("--baseline", default=str(EVAL_DIR / "baseline_deterministic.json"),
                    help="fail if case pass rate or claim recall drops below this file's values")
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--dataset", choices=sorted(DATASETS), default="dev",
                    help="dev (regression set, baseline-gated) or heldout (frozen independent set, report only)")
    ap.add_argument("--out", default=None, help="result file stem (default depends on --dataset)")
    args = ap.parse_args(argv)
    global DATA_DIR, DATASET_VERSION
    DATA_DIR, DATASET_VERSION, stem = DATASETS[args.dataset]
    stem = args.out or stem
    results = run_all()
    summary = summarise(results)
    summary["at"] = datetime.now(UTC).isoformat()
    summary["git_sha"] = _git_sha()
    RESULTS.mkdir(parents=True, exist_ok=True)
    payload = {"summary": summary, "cases": results}
    (RESULTS / f"{stem}.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    (RESULTS / f"{stem}.md").write_text(report_md(summary, results), encoding="utf-8")
    if args.record:
        from app.db import SessionLocal, init_db
        from app.models import EvalRun

        init_db()
        db = SessionLocal()
        try:
            db.add(EvalRun(dataset_version=DATASET_VERSION, provider="none", model="none (deterministic)", kind="deterministic",
                           verifier_version=VERIFIER_VERSION, git_sha=summary["git_sha"], summary=summary, cases=results))
            db.commit()
        finally:
            db.close()
    print(json.dumps({k: summary[k] for k in ("cases", "errors", "case_pass_rate", "claim_detection_precision", "claim_detection_recall",
                                              "false_acceptance_rate", "false_rejection_rate", "pii_recall")}, indent=2))
    if args.dataset.startswith("heldout"):
        return 0  # the held-out set is reported, never used as a CI gate (gating would invite tuning to it)
    base_path = Path(args.baseline)
    if args.write_baseline:
        base_path.write_text(json.dumps({k: summary[k] for k in ("case_pass_rate", "claim_detection_recall", "claim_detection_precision",
                                                                 "pii_recall", "cases")}, indent=2) + "\n", encoding="utf-8")
        return 0
    if base_path.exists():
        base = json.loads(base_path.read_text())
        regressions = [k for k in ("case_pass_rate", "claim_detection_recall", "claim_detection_precision", "pii_recall")
                       if base.get(k) is not None and (summary.get(k) or 0) < base[k] - 1e-9]
        if regressions:
            print(f"REGRESSION vs baseline: {regressions}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
