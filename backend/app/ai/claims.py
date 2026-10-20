"""Unsupported-claim detection.

Generated text (LinkedIn posts, tailored CVs, CV updates) is compared with the evidence it was
generated from. A *claim* is a checkable atom extracted from the output:
  - numbers / percentages / durations     ("40%", "3 years", "10k users")
  - skills & technologies (lexicon based)  ("Kubernetes")
  - credentials                            ("PhD", "certified", "award", "first place")
A claim is unsupported when it does not appear in the evidence text. The unsupported-claim rate
feeds the monitoring dashboard and the evaluation report.
"""
from __future__ import annotations

import re

from app.ai.skills import find_skills

_NUM = re.compile(r"(?<![\w.])(\d+(?:[.,]\d+)?)\s*(%|percent|x|k\+?|m\+?|\+)?(?:\s*(years?|months?|users|customers|clients|students|people|hours))?", re.I)
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
CREDENTIAL_TERMS = [
    "phd", "doctorate", "master's", "masters", "mba", "bachelor", "certified", "certification", "award",
    "first place", "1st place", "winner", "won", "patent", "published", "promoted", "founder", "co-founder",
    "head of", "director", "دكتوراه", "ماجستير", "شهادة", "جائزة", "المركز الأول",
]


def _norm(text: str) -> str:
    return text.translate(_ARABIC_DIGITS).lower()


def extract_claims(text: str) -> dict[str, set[str]]:
    t = _norm(text)
    numbers = set()
    for m in _NUM.finditer(t):
        val = m.group(1).replace(",", "")
        # ignore list markers / years-as-dates are still claims (e.g. "2024") -> keep them, they are checkable
        if len(val) == 1 and not m.group(2) and not m.group(3):
            continue  # bare single digits ("1 project") are too noisy
        numbers.add(val)
    creds = {c for c in CREDENTIAL_TERMS if re.search(r"(?<!\w)" + re.escape(c) + r"(?!\w)", t)}
    return {"numbers": numbers, "skills": find_skills(text), "credentials": creds}


def check_claims(output: str, evidence: str) -> dict:
    out = extract_claims(output)
    ev_norm = _norm(evidence)
    ev_numbers = {m.group(1).replace(",", "") for m in _NUM.finditer(ev_norm)}
    ev_skills = {s.lower() for s in find_skills(evidence)}
    unsupported: list[dict] = []
    for n in sorted(out["numbers"]):
        if n not in ev_numbers:
            unsupported.append({"type": "number", "value": n})
    for s in sorted(out["skills"]):
        if s.lower() not in ev_skills:
            unsupported.append({"type": "skill", "value": s})
    for c in sorted(out["credentials"]):
        if not re.search(r"(?<!\w)" + re.escape(c) + r"(?!\w)", ev_norm):
            unsupported.append({"type": "credential", "value": c})
    checked = len(out["numbers"]) + len(out["skills"]) + len(out["credentials"])
    return {
        "claims_checked": checked,
        "unsupported": unsupported,
        "unsupported_count": len(unsupported),
        "unsupported_rate": round(len(unsupported) / checked, 3) if checked else 0.0,
        "passed": not unsupported,
    }
