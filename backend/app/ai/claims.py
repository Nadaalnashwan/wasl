"""Claim verification v2 — how Wasl judges whether AI-written text is supported by the user's evidence.

Generated text (LinkedIn posts, tailored CVs, CV updates) is split into sentences and every checkable atom is
extracted and judged against the evidence it was generated from (achievement data, verified quotes, the CV):

  number       value + unit class (%, time unit, people, money, multiplier, year) — "10 days" ≠ "10 months",
               "10 seconds" ≠ "10%". 10k = 10,000. Bare single digits without a unit are ignored (too noisy).
  skill        lexicon skills (app/ai/skills.py). Contradicted when every evidence mention is negated
               ("did not use Python"); unsupported when the text claims professional use but the evidence only
               shows study ("studied Kubernetes" vs "deployed Kubernetes in production").
  credential   degrees, certifications, awards, titles. Attending a course is not certification; a plan is not
               a completion; an award won by a colleague is not the user's award.
  role         leadership verbs ("led", "managed", "قاد") need leadership evidence — "participated" is not "led".
               "Managed 20 people" needs management evidence, not "worked with a team of 20".
  attribution  individual credit ("I personally", "single-handedly", "I won") for a result the evidence credits to
               a team needs the user's confirmation.

Statuses: supported · unsupported · contradicted · ambiguous · needs_confirmation · unavailable.
`passed` is True only when no claim is unsupported, contradicted, needs_confirmation or unavailable.
Ambiguous claims are surfaced to the user but do not block.

The checker is deterministic (no LLM): it cannot be prompt-injected, costs nothing and is reproducible in CI. Its
measured precision/recall on the adversarial suite is reported in docs/EVALUATION.md. It still misses paraphrased
fabrications that contain no number, skill, credential, leadership or attribution cue — the UI says so.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from app.ai.skills import find_skills

VERIFIER_VERSION = "claims-v2.2"


def _aw(*words: str) -> str:
    """Arabic whole-word alternatives. Arabic has no \\b, so 'لم' must not match inside 'المواعيد' and 'قاد' must not
    match inside 'القادمة'. Allows one conjunction/preposition prefix letter (و ف ب ل)."""
    return "(?<![؀-ۿ])(?:[وفبل])?(?:" + "|".join(words) + ")(?![؀-ۿ])"

BLOCKING = {"unsupported", "contradicted", "needs_confirmation", "unavailable"}
FABRICATION = {"unsupported", "contradicted"}

_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩٫٬", "0123456789.,")
AR = r"؀-ۿ"

CREDENTIAL_TERMS = [
    "phd", "doctorate", "master's", "masters", "mba", "bachelor", "certified", "certification", "certificate", "award",
    "first place", "1st place", "second place", "winner", "won", "patent", "published", "promoted", "founder", "co-founder",
    "head of", "director", "msc", "m.sc", "bsc", "b.sc", "diploma", "دكتوراه", "ماجستير", "بكالوريوس", "دبلوم",
    "شهادة", "معتمد", "جائزة", "المركز الأول", "المركز الثاني", "فزت", "فاز",
]
# outcome / prestige words that must appear in the evidence when the text uses them
_PRESTIGE = re.compile(r"\b(best|top|award-winning|first-ever|largest|highest|#1|number one|record-breaking|world-class|leading|"
                       r"keynote|spoke at|speaker at|presented at|published in|featured in|doubled|tripled|halved|quadrupled|"
                       # vague impact inflation: must be stated in the evidence, not added by the model
                       r"the first(?!\s+(?:time|version|phase|step|stage|year|month|week|day|release|draft|iteration|half|quarter|"
                       r"semester|term|round|sprint|prototype|milestone|module|part|of))|"
                       r"significantly|dramatically|substantially|drastically|greatly|massively|hugely|vastly|"
                       r"eliminat(?:ed|ing|es)|zero (?:downtime|bugs|defects|errors|incidents)|flawless(?:ly)?)\b|"
                       + _aw("أفضل", "الأفضل", "الأولى", "متحدث", "متحدثة", "ضاعفت"), re.I)
_PLACE = re.compile(r"\b(first|1st|second|2nd|third|3rd)\s+place\b|المركز\s+(الأول|الثاني|الثالث)", re.I)
_TITLE = re.compile(r"\b((?:[A-Z][A-Za-z+#.-]*\s){1,3}(?:Engineer|Architect|Manager|Scientist|Analyst|Developer|Consultant|Director|"
                    r"Lead|Designer|Specialist|Officer|Administrator|Researcher))\b")
_ORG = re.compile(r"\b(?:at|for|with|joined|from)\s+((?:[A-Z][\w&.-]*)(?:\s+[A-Z][\w&.-]*){0,3})")
_CERT_TERMS = {"certified", "certification", "certificate", "شهادة", "معتمد"}
_AWARD_TERMS = {"award", "first place", "1st place", "second place", "winner", "won", "جائزة", "المركز الأول", "فزت", "فاز"}
_CERT_EARNED = re.compile(r"\b(certified|certification|certificate|passed|earned|obtained|achieved|awarded|licensed)\b|" + _aw("حصلت", "اجتزت", "نلت", "معتمد", "معتمدة"), re.I)
_ATTENDED = re.compile(r"\b(attended|course|class|training|workshop|bootcamp|webinar|enrolled|studying|tutorial)\b|" + _aw("حضرت", "دورة", "ورشة", "التحقت", "تدريب"), re.I)
_PLANNED = re.compile(r"\b(plan(?:ning|ned)? to|will|aim(?:ing)? to|intend(?:ing)? to|hope to|going to|next (?:year|month|semester)|"
                      r"preparing for|working towards|pursuing)\b|" + _aw("أخطط", "سوف", "أنوي", "أسعى", "أستعد"), re.I)
_NEGATION = re.compile(r"\b(not|no|never|without|didn't|did not|haven't|have not|wasn't|was not|none|lack(?:ed|ing)?)\b|" + _aw("لم", "لا", "بدون", "دون", "ليس", "لن"), re.I)
_STUDY = re.compile(r"\b(studied|study|studying|learn(?:ed|ing|t)?|course|class|tutorial|introduction to|intro to|attended|workshop|"
                    r"reading about|familiar with|exposure to|basics of)\b|" + _aw("درست", "أتعلم", "تعلمت", "دورة", "ورشة", "مقدمة"), re.I)
_USAGE = re.compile(r"\b(experienced|experience (?:in|with)|expert|expertise|proficient|professional(?:ly)?|deployed|production|"
                    r"built|developed|implemented|engineered|architected|years of|hands-on|maintained|operated|ran)\b|" + _aw("خبرة", "محترف", "نشرت", "طورت", "بنيت"), re.I)
_STRONG_ROLE = re.compile(r"\b(?:(?:led|lead|leads|leading)(?!\s+to\b)|headed|directed|spearheaded|supervised|oversaw|"
                          r"owned|took ownership of|championed|"
                          r"in charge of|team lead|tech lead|"
                          r"(?:managed|manage|manages|managing)(?=(?:\s+\w+){0,3}?\s+(?:team|teams|people|engineers|developers|staff|"
                          r"project|projects|group|department|squad|interns|employees|members|\d+)\b))\b|"
                          + _aw("قاد", "قدت", "قادت", "أدار", "أدرت", "أدارت", "ترأس", "ترأست", "أشرف", "أشرفت"), re.I)
_WEAK_ROLE = re.compile(r"\b(participated|participant|contributed|contributor|assisted|helped|supported|member of|part of|involved in|"
                        r"took part)\b|" + _aw("شارك", "شاركت", "ساهم", "ساهمت", "ساعد", "ساعدت", "عضو", "عضوة"), re.I)
_MANAGE_PEOPLE = re.compile(r"\b(managed|managing|supervised|supervising|led|leading|oversaw|directed|headed)\b(?:\s+\w+){0,3}?\s+(\d+)\s*"
                            r"(?:people|employees|engineers|developers|staff|members|reports|persons|interns)?|أدرت\s+(\d+)|أشرفت على\s+(\d+)", re.I)
_TEAM_SIZE = re.compile(r"\b(team of|group of|squad of|worked with|alongside|with a team of|(\d+)-person team)\b|فريق من|مع فريق", re.I)
_INDIVIDUAL = re.compile(r"\b(personally|single-handedly|singlehandedly|by myself|on my own|alone|solely|i alone|entire|entirely)\b|"
                         + _aw("بمفردي", "وحدي", "بنفسي", "لوحدي"), re.I)
_I_WON = re.compile(r"\b(i|i've|i have)\s+(won|achieved|secured|earned|took)\b|\bmy (award|win|first place)\b|" + _aw("فزت", "حققت"), re.I)
_TEAM = re.compile(r"\b(our team|the team|we|our group|team won|team achieved|together|collectively|my team)\b|" + _aw("فريقنا", "الفريق", "نحن", "فزنا", "حققنا"), re.I)
_OTHER_PERSON = re.compile(r"\b(my colleague|a colleague|colleague|teammate|my friend|classmate|he|she|my manager|my supervisor|another student)\b"
                           r"|" + _aw("زميلي", "زميلتي", "صديقي", "مديري"), re.I)
_FIRST_PERSON_BUILD = re.compile(r"\b(i|i've|i have)\s+(built|created|developed|designed|wrote|implemented|launched|shipped|made)\b|"
                                 r"\bmy (project|app|system|tool)\b|" + _aw("بنيت", "طورت", "صممت", "أنشأت"), re.I)

_NUM = re.compile(
    r"(?P<cur>[$£€])?(?<![\w.])(?P<val>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*-?\s*"
    rf"(?P<suf>%|٪|k\b|m\b|x\b|\+)?\s*(?P<w1>[A-Za-z{AR}$]+)?(?:\s+(?P<w2>[A-Za-z{AR}]+))?",
    re.I,
)

_UNIT_CLASSES: list[tuple[str, re.Pattern[str]]] = [
    ("percent", re.compile(r"^(percent|per|pct|بالمئة|بالمائة|المئة|بالمية)$", re.I)),
    ("x", re.compile(r"^(times|fold|x)$", re.I)),
    ("time:second", re.compile(r"^(seconds?|secs?|s|ثوان|ثواني|ثانية)$", re.I)),
    ("time:minute", re.compile(r"^(minutes?|mins?|دقيقة|دقائق)$", re.I)),
    ("time:hour", re.compile(r"^(hours?|hrs?|h|ساعة|ساعات)$", re.I)),
    ("time:day", re.compile(r"^(days?|يوم|أيام|ايام)$", re.I)),
    ("time:week", re.compile(r"^(weeks?|أسبوع|أسابيع)$", re.I)),
    ("time:month", re.compile(r"^(months?|شهر|أشهر|شهور)$", re.I)),
    ("time:year", re.compile(r"^(years?|yrs?|سنة|سنوات|عام|أعوام|سنين)$", re.I)),
    ("people", re.compile(r"^(users?|customers?|clients?|students?|people|persons?|members?|employees?|engineers?|developers?|staff|"
                          r"participants?|attendees?|learners?|visitors?|subscribers?|followers?|registrations?|interns?|"
                          r"مستخدم|مستخدمين|مستخدما|عميل|عملاء|طالب|طلاب|طالبة|طالبات|موظف|موظفين|موظفا|موظفًا|موظفة|موظفات|"
                          r"مطور|مطورين|مطورا|مهندس|مهندسين|متدرب|متدربين|شخص|أشخاص|عضو|أعضاء|مشارك|مشاركين)$", re.I)),
    ("money", re.compile(r"^(usd|dollars?|sar|riyals?|ريال|دولار|\$)$", re.I)),
]
_FILLER = re.compile(r"^(more|new|active|monthly|daily|weekly|total|over|of|than|unique|paying|registered|and|to|in|at|for|by|from|على|من|إلى|في)$", re.I)


@dataclass
class Atom:
    kind: str  # number | skill | credential | role | attribution
    value: str
    sentence: str
    unit: str = ""
    num: float | None = None


@dataclass
class Claim:
    id: str
    text: str
    kind: str
    value: str
    status: str
    reasons: list[str] = field(default_factory=list)
    evidence: list[dict] = field(default_factory=list)
    method: str = "deterministic"


def _norm(text: str) -> str:
    return (text or "").translate(_ARABIC_DIGITS)


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?؟;])\s+|\n+|\s+[•·▪-]\s+", _norm(text))
    return [p.strip(" -•\t") for p in parts if p and p.strip(" -•\t")]


def _unit_class(w: str | None) -> str:
    if not w:
        return ""
    for name, pat in _UNIT_CLASSES:
        if pat.match(w):
            return name
    return "noun:" + re.sub(r"(ies|es|s)$", "", w.lower())


def _numbers(sentence: str) -> list[Atom]:
    out = []
    for m in _NUM.finditer(sentence):
        raw = m.group("val")
        if re.fullmatch(r"\d{1,2}", raw) and re.search(rf"\b{raw}(st|nd|rd|th)\b", sentence[m.start("val"):m.start("val") + 5], re.I):
            continue  # ordinals ("1st place") are handled as credentials
        val = float(raw.replace(",", ""))
        suf = (m.group("suf") or "").lower()
        if suf == "k":
            val *= 1_000
        elif suf == "m":
            val *= 1_000_000
        unit = ""
        if suf in ("%", "٪"):
            unit = "percent"
        elif suf == "x":
            unit = "x"
        elif m.group("cur"):
            unit = "money"
        else:
            w1, w2 = m.group("w1"), m.group("w2")
            if w1 and _FILLER.match(w1) and w2:
                w1 = w2
            cls = _unit_class(w1)
            unit = cls
            if cls.startswith("noun:") and w1 and w1.lower() in ("percent", "per"):
                unit = "percent"
        before = sentence[max(0, m.start() - 16):m.start()].lower()
        if not unit or unit.startswith("noun:"):
            if re.search(r"(team of|group of|فريق من|with)\s*$", before):
                unit = "people"
        is_year = not unit or unit.startswith("noun:")
        if is_year and 1950 <= val <= 2100 and "." not in raw and "," not in raw:
            unit = "year_date"
        if re.fullmatch(r"\d", raw) and not unit:
            continue  # bare single digits are too noisy ("1 project")
        if unit.startswith("noun:") and len(raw) == 1:
            unit = unit  # "3 projects" — still a checkable count
        out.append(Atom("number", raw, sentence, unit=unit, num=val))
    return out


def _has_term(text: str, term: str) -> bool:
    return bool(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.I))


def extract_atoms(text: str) -> list[Atom]:
    atoms: list[Atom] = []
    for s in sentences(text):
        atoms += _numbers(s)
        for sk in sorted(find_skills(s)):
            atoms.append(Atom("skill", sk, s))
        for c in CREDENTIAL_TERMS:
            if _has_term(s, c):
                atoms.append(Atom("credential", c, s))
        if _STRONG_ROLE.search(s):
            atoms.append(Atom("role", _STRONG_ROLE.search(s).group(0), s))
        for m in _PRESTIGE.finditer(s):
            atoms.append(Atom("prestige", m.group(0).lower(), s))
        for m in _PLACE.finditer(s):
            atoms.append(Atom("place", m.group(0).lower(), s))
        for m in _TITLE.finditer(s):
            atoms.append(Atom("title", m.group(1), s))
        for m in _ORG.finditer(s):
            org = m.group(1)
            if not find_skills(org) and org.split()[0] not in {"I", "My", "The", "A", "An", "Our", "This"}:
                atoms.append(Atom("entity", org, s))
        if _INDIVIDUAL.search(s) or _I_WON.search(s):
            m = _INDIVIDUAL.search(s) or _I_WON.search(s)
            atoms.append(Atom("attribution", m.group(0), s))
    # de-duplicate identical atoms (same kind/value/unit) — each counted once
    seen, uniq = set(), []
    for a in atoms:
        key = (a.kind, a.value.lower(), a.unit, a.num)
        if key not in seen:
            seen.add(key)
            uniq.append(a)
    return uniq


def extract_claims(text: str) -> dict[str, set[str]]:
    """Legacy summary view (v1 API)."""
    atoms = extract_atoms(text)
    return {"numbers": {a.value.replace(",", "") for a in atoms if a.kind == "number"},
            "skills": {a.value for a in atoms if a.kind == "skill"},
            "credentials": {a.value for a in atoms if a.kind == "credential"}}


class _Evidence:
    def __init__(self, text: str):
        self.text = _norm(text)
        self.sents = sentences(text)
        self.numbers = [n for s in self.sents for n in _numbers(s)]
        self.skill_sents: dict[str, list[str]] = {}
        for s in self.sents:
            for sk in find_skills(s, implied=True):
                self.skill_sents.setdefault(sk.lower(), []).append(s)

    def mentions(self, term: str) -> list[str]:
        return [s for s in self.sents if _has_term(s, term)]


_UNIT_LABEL = {"percent": "%", "x": "×", "money": "(currency)", "people": "people", "time:second": "seconds", "time:minute": "minutes",
               "time:hour": "hours", "time:day": "days", "time:week": "weeks", "time:month": "months", "time:year": "years"}


def _label(a: Atom) -> str:
    if a.kind != "number" or not a.unit or a.unit.startswith("noun:") or a.unit == "year_date":
        return a.value
    lab = _UNIT_LABEL.get(a.unit, "")
    return f"{a.value}%" if lab == "%" else f"{a.value} {lab}".strip()


_STOP = set("""a an the and or of for to in on at by with from into over this that these those our my we i you it its was were is are be been
has have had as per via than then more most less new using used use built build made make across within up down out off
data team work worked working project projects system systems service services""".split())


def _content(s: str) -> set[str]:
    return {w for w in re.findall(rf"[A-Za-z{AR}]{{4,}}", s.lower()) if w not in _STOP}


def _shares_context(claim_sentence: str, evidence_sentence: str) -> bool:
    """A number is only supported if the evidence sentence it comes from talks about the same thing."""
    c, e = _content(claim_sentence), _content(evidence_sentence)
    if not c or not e:
        return True
    return bool({w[:5] for w in c} & {w[:5] for w in e})


def _q(s: str) -> dict:
    return {"source": "evidence", "quote": s[:220]}


_TEAM_ACTOR = re.compile(r"\b(we|we've|we have|our team|my team|the team|our group|together)\b|" + _aw("نحن", "فريقنا", "الفريق"), re.I)
_SELF_ACTOR = re.compile(r"\b(i|i've|i'd|i have|i had|me|myself)\b|" + _aw("أنا"), re.I)
_NOT_A_NAME = {"I", "We", "Our", "My", "The", "This", "That", "Then", "Later", "Also", "Recently", "Previously", "In", "At",
               "During", "After", "Before", "Together", "As", "When", "While", "For", "On", "With", "And", "Built", "Created",
               "Designed", "Developed", "Led", "Managed", "Wrote", "Implemented", "Launched", "Received", "Won", "Its", "A", "An"}
_PASSIVE_BY = re.compile(r"\b(?:led|headed|managed|directed|supervised|overseen|owned|run|built|created|designed|developed|written|"
                         r"implemented|launched|made|won|received|awarded|given)\s+by\s+(?!me\b|myself\b|us\b|my team\b|our team\b)", re.I)
_CREATE_VERB = re.compile(r"\b(built|created|developed|designed|wrote|implemented|launched|shipped|made|architected|coded|programmed)\b", re.I)
_AWARD_VERB = re.compile(r"\b(won|received|earned|was awarded|were awarded|got|secured|was given|took home)\b|"
                         + _aw("فاز", "فازت", "حصل", "حصلت", "نال", "نالت"), re.I)


def _actor(sentence: str, start: int) -> str:
    """Who performs the verb starting at `start`: 'self', 'team', 'other' or 'unknown' (CV voice, no subject)."""
    clause = re.split(r"[;:.!?]|,(?!\d)|\band\b(?=\s+(?:i|we|my|our)\b)|\bwhile\b|\bbut\b", sentence[:start], flags=re.I)[-1]
    tail = clause.split()[-4:]
    tail_s = " ".join(tail)
    if _TEAM_ACTOR.search(tail_s):
        return "team"
    if _SELF_ACTOR.search(tail_s):
        return "self"
    if _OTHER_PERSON.search(tail_s):
        return "other"
    if any(re.fullmatch(r"[A-Z][a-z]{1,20}", t.strip("'\"()")) and t.strip("'\"()") not in _NOT_A_NAME for t in tail):
        return "other"
    return "unknown"


def _verb_actors(sentence: str, verb: re.Pattern) -> set[str]:
    """Actors of every `verb` occurrence in the sentence; passives ('led by Fahad') count as 'other'."""
    out = set()
    for m in verb.finditer(sentence):
        if re.match(r"\s+by\s+(?!me\b|myself\b|us\b|my team\b|our team\b)", sentence[m.end():], re.I):
            out.add("other")
        else:
            who = _actor(sentence, m.start())
            # Arabic is verb-subject order ("فاز زميلي"): look right after the verb when nothing precedes it
            if who == "unknown" and re.search(rf"[{AR}]", m.group(0)):
                after = " ".join(sentence[m.end():].split()[:2])
                if _OTHER_PERSON.search(after):
                    who = "other"
                elif _TEAM_ACTOR.search(after):
                    who = "team"
            out.add(who)
    return out


def _object_words(text: str) -> set[str]:
    return {w[:6] for w in re.findall(rf"[A-Za-z{AR}]{{3,}}", text.lower()) if w not in _STOP}


def _authorship_conflicts(output: str, ev: _Evidence, contribution_confirmed: bool | None) -> list[tuple]:
    """Creation claims ("I built the dashboard") whose object the evidence credits only to someone else
    (contradicted) or only to a team (needs confirmation). Silent when the evidence never mentions the object."""
    out = []
    for s in sentences(output):
        for m in _CREATE_VERB.finditer(s):
            who_out = _actor(s, m.start())
            if who_out in ("other", "team"):
                continue
            obj = _object_words(re.split(r"[,;.]|\band\b", s[m.end():])[0])
            if not obj:
                continue
            credited: list[tuple[str, str]] = []
            for es in ev.sents:
                for em in _CREATE_VERB.finditer(es):
                    by = re.match(r"\s+by\s+(\w+)", es[em.end():], re.I)
                    if by:  # passive: "The dashboard was built by Sara" — the object precedes the verb
                        eobj = _object_words(re.split(r"[,;.]", es[:em.start()])[-1])
                        who = "self" if by.group(1).lower() in ("me", "myself") else ("team" if by.group(1).lower() == "us" else "other")
                    else:
                        eobj = _object_words(re.split(r"[,;.]|\band\b", es[em.end():])[0])
                        who = _actor(es, em.start())
                    if obj & eobj:
                        credited.append((who, es))
            actors = {w for w, _ in credited}
            if not actors or actors & {"self", "unknown"}:
                continue
            if "team" in actors:
                if who_out == "self" and not contribution_confirmed:
                    out.append((s, m.group(0), "needs_confirmation", ["team_vs_individual"],
                                _q(next(es for w, es in credited if w == "team"))))
                continue
            out.append((s, m.group(0), "contradicted", ["attributed_to_other"], _q(credited[0][1])))
    return out


def _judge(a: Atom, ev: _Evidence, contribution_confirmed: bool | None) -> tuple[str, list[str], list[dict]]:
    if a.kind == "number":
        same = [n for n in ev.numbers if n.num is not None and a.num is not None and abs(n.num - a.num) < 1e-9]
        if not same:
            return "unsupported", ["number_not_in_evidence"], []
        if not a.unit or a.unit == "year_date" and any(n.unit in ("", "year_date") for n in same):
            return "supported", [], [_q(same[0].sentence)]
        exact = [n for n in same if n.unit == a.unit]
        if exact:
            ctx = [n for n in exact if _shares_context(a.sentence, n.sentence)]
            if ctx or a.unit in ("year_date", "time:year"):
                return "supported", [], [_q((ctx or exact)[0].sentence)]
            return "unsupported", ["number_wrong_context"], [_q(exact[0].sentence)]
        loose = [n for n in same if n.unit.startswith("noun:") and a.unit.startswith("noun:")
                 or n.unit in ("", "year_date") and a.unit.startswith("noun:")]
        if loose:
            return "supported", [], [_q(loose[0].sentence)]
        if all(n.unit in ("", "year_date") for n in same):
            return "ambiguous", ["number_unit_unclear"], [_q(same[0].sentence)]
        return "unsupported", ["number_unit_mismatch"], [_q(same[0].sentence)]

    if a.kind == "skill":
        sents = ev.skill_sents.get(a.value.lower(), [])
        if not sents:
            return "unsupported", ["skill_not_in_evidence"], []
        if all(_NEGATION.search(s) for s in sents):
            if _NEGATION.search(a.sentence):  # the text restates the negation ("without writing any Python")
                return "supported", [], [_q(sents[0])]
            return "contradicted", ["skill_negated"], [_q(sents[0])]
        if _USAGE.search(a.sentence) and not _STUDY.search(a.sentence) and all(_STUDY.search(s) and not _USAGE.search(s) for s in sents):
            return "unsupported", ["skill_studied_only"], [_q(sents[0])]
        return "supported", [], [_q(sents[0])]

    if a.kind == "credential":
        term = a.value
        if term in _CERT_TERMS:
            hits = [s for s in ev.sents if _CERT_EARNED.search(s) or _has_term(s, term)]
            earned = [s for s in hits if not _PLANNED.search(s) and (_CERT_EARNED.search(s) or _has_term(s, term))
                      and not (_ATTENDED.search(s) and not re.search(r"certif|شهادة|معتمد|passed|اجتزت", s, re.I))]
            if earned and not all(_PLANNED.search(s) for s in earned):
                return "supported", [], [_q(earned[0])]
            if any(_PLANNED.search(s) for s in hits) and _PLANNED.search(a.sentence):
                return "supported", [], [_q(next(s for s in hits if _PLANNED.search(s)))]
            if _ATTENDED.search(a.sentence) and not re.search(r"\bcertified\b|معتمد", a.sentence, re.I) and any(_ATTENDED.search(s) for s in ev.sents):
                return "supported", [], [_q(next(s for s in ev.sents if _ATTENDED.search(s)))]
            if any(_PLANNED.search(s) for s in hits):
                return "unsupported", ["credential_planned_only"], [_q(next(s for s in hits if _PLANNED.search(s)))]
            att = [s for s in ev.sents if _ATTENDED.search(s)]
            if att:
                return "unsupported", ["credential_attended_only"], [_q(att[0])]
            return "unsupported", ["credential_not_in_evidence"], []
        hits = ev.mentions(term)
        if term in _AWARD_TERMS:
            award_sents = hits or [s for s in ev.sents if any(_has_term(s, t) for t in _AWARD_TERMS)]
            if not award_sents:
                return "unsupported", ["credential_not_in_evidence"], []
            def _awarded_to_other(s: str) -> bool:
                acts = _verb_actors(s, _AWARD_VERB)
                if acts:
                    return acts == {"other"}
                return bool(_OTHER_PERSON.search(s)) and not re.search(r"\b(i|we|our)\b|فزت|فزنا|فريقنا", s, re.I)

            if all(_awarded_to_other(s) for s in award_sents):
                if _OTHER_PERSON.search(a.sentence) and not _I_WON.search(a.sentence):
                    return "supported", [], [_q(award_sents[0])]  # the text credits the colleague, too
                return "contradicted", ["attributed_to_other"], [_q(award_sents[0])]
            if _I_WON.search(a.sentence) and all(_TEAM.search(s) for s in award_sents) and not contribution_confirmed:
                return "needs_confirmation", ["team_vs_individual"], [_q(award_sents[0])]
            return "supported", [], [_q(award_sents[0])]
        if not hits:
            return "unsupported", ["credential_not_in_evidence"], []
        if all(_PLANNED.search(s) for s in hits) and not _PLANNED.search(a.sentence):
            return "unsupported", ["credential_planned_only"], [_q(hits[0])]
        return "supported", [], [_q(hits[0])]

    if a.kind == "place":
        rank = lambda t: {"first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3, "الأول": 1, "الثاني": 2, "الثالث": 3}.get(  # noqa: E731
            (_PLACE.search(t).group(1) or _PLACE.search(t).group(2) or "").lower())
        want = rank(a.value)
        ev_places = [s for s in ev.sents if _PLACE.search(s)]
        if any(rank(s) == want for s in ev_places):
            return "supported", [], [_q(next(s for s in ev_places if rank(s) == want))]
        if ev_places:
            return "contradicted", ["place_mismatch"], [_q(ev_places[0])]
        return "unsupported", ["credential_not_in_evidence"], []

    if a.kind in ("prestige", "title", "entity"):
        term = a.value
        pat = r"(?<!\w)" + re.escape(term) + r"(?!\w)"
        stem = re.match(r"^([a-z]{4,}?)(?:ed|ing|es|ly)$", term) if a.kind == "prestige" else None
        if stem:  # "eliminated" in the evidence supports "eliminating"
            pat = r"(?<!\w)" + re.escape(stem.group(1)) + r"\w*"
        hits = [s for s in ev.sents if re.search(pat, s, re.I)]
        if hits:
            return "supported", [], [_q(hits[0])]
        reason = {"prestige": "prestige_not_in_evidence", "title": "title_not_in_evidence", "entity": "entity_not_in_evidence"}[a.kind]
        return "unsupported", [reason], []

    if a.kind == "role":
        mp = _MANAGE_PEOPLE.search(a.sentence)
        if mp:
            n = next((g for g in mp.groups()[1:] if g), None)
            managed_ev = [s for s in ev.sents if _MANAGE_PEOPLE.search(s)]
            if n and not any(n in s for s in managed_ev):
                team = [s for s in ev.sents if n in s and _TEAM_SIZE.search(s)]
                if team:
                    own_role = [s for s in ev.sents if _STRONG_ROLE.search(s) and _verb_actors(s, _STRONG_ROLE) & {"self", "team", "unknown"}]
                    # "I led our 4-person team" from "I was a member of the 4-person team": both the number's meaning
                    # and the role are wrong, so report both
                    return "unsupported", ["team_size_as_reports", *([] if own_role else ["role_inflated"])], [_q(team[0])]
        strong = [s for s in ev.sents if _STRONG_ROLE.search(s)]
        own = [s for s in strong if _verb_actors(s, _STRONG_ROLE) & {"self", "team", "unknown"}]
        if own:
            return "supported", [], [_q(own[0])]
        if strong:  # "the refactor led by Fahad": the role belongs to someone else
            return "unsupported", ["role_inflated"], [_q(strong[0])]
        weak = [s for s in ev.sents if _WEAK_ROLE.search(s)]
        return "unsupported", ["role_inflated"], [_q(weak[0])] if weak else []

    if a.kind == "attribution":
        team = [s for s in ev.sents if _TEAM.search(s)]
        mine = [s for s in ev.sents if _INDIVIDUAL.search(s) or re.search(r"\b(i|my)\b|أنا", s, re.I)]
        if team and not any(_INDIVIDUAL.search(s) for s in mine) and not contribution_confirmed:
            return "needs_confirmation", ["team_vs_individual"], [_q(team[0])]
        return "supported", [], [_q(mine[0])] if mine else []

    return "ambiguous", [], []


def check_claims(output: str, evidence: str, *, contribution_confirmed: bool | None = None) -> dict:
    """Verify `output` against `evidence`. Returns the v2 report (v1 keys preserved for existing callers).

    contribution_confirmed=False marks first-person "I built…" statements as needing confirmation (used for
    repository/team-derived achievements whose personal contribution the user has not confirmed yet).
    """
    try:
        ev = _Evidence(evidence)
        claims: list[Claim] = []
        for i, a in enumerate(extract_atoms(output), 1):
            status, reasons, spans = _judge(a, ev, contribution_confirmed)
            claims.append(Claim(f"c{i}", a.sentence[:240], a.kind, _label(a), status, reasons, spans))
        for sent, verb, status, reasons, span in _authorship_conflicts(output, ev, contribution_confirmed):
            claims.append(Claim(f"c{len(claims) + 1}", sent[:240], "attribution", verb, status, reasons, [span]))
        if contribution_confirmed is False:
            for s in sentences(output):
                if _FIRST_PERSON_BUILD.search(s):
                    claims.append(Claim(f"c{len(claims) + 1}", s[:240], "attribution", _FIRST_PERSON_BUILD.search(s).group(0),
                                        "needs_confirmation", ["contribution_unconfirmed"], []))
                    break
    except Exception:  # noqa: BLE001 — never report "verified" when the checker itself failed
        return unavailable_report()
    return _report(claims)


def _report(claims: list[Claim]) -> dict:
    summary = {k: 0 for k in ("supported", "unsupported", "contradicted", "ambiguous", "needs_confirmation", "unavailable")}
    for c in claims:
        summary[c.status] += 1
    flagged = [c for c in claims if c.status != "supported"]
    fabricated = [c for c in claims if c.status in FABRICATION]
    checked = len(claims)
    _type = {"number": "number", "skill": "skill", "credential": "credential", "role": "role", "attribution": "attribution"}
    return {
        "verifier_version": VERIFIER_VERSION,
        "claims_checked": checked,
        # v1-compatible: unsupported = fabrication-type findings (unsupported + contradicted)
        "unsupported": [{"type": _type.get(c.kind, c.kind), "value": c.value, "status": c.status,
                         "reason": c.reasons[0] if c.reasons else ""} for c in flagged],
        "unsupported_count": len(fabricated),
        "unsupported_rate": round(len(fabricated) / checked, 3) if checked else 0.0,
        "blocking_count": sum(1 for c in claims if c.status in BLOCKING),
        "passed": not any(c.status in BLOCKING for c in claims),
        "summary": summary,
        "claims": [asdict(c) for c in claims],
    }


def unavailable_report() -> dict:
    c = Claim("c1", "", "statement", "", "unavailable", ["verifier_unavailable"], [])
    r = _report([c])
    r["claims_checked"] = 0
    r["unsupported_rate"] = 0.0
    return r


def merge_reports(reports: list[dict]) -> dict:
    """Combine per-field reports (e.g. every tailored bullet) into one report."""
    claims: list[Claim] = []
    for r in reports:
        for c in r.get("claims", []):
            claims.append(Claim(**{**c, "id": f"c{len(claims) + 1}"}))
    return _report(claims)
