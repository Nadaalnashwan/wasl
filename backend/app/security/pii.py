"""PII redaction before any text leaves Wasl for an external AI provider.

Enforced centrally in app/ai/router.py (`run_structured`): every outbound message passes through a per-request
`Redactor`, and placeholders in the model's answer are restored locally before the result is used. The mapping
(placeholder → original) lives only in process memory for that request; it is never sent, logged or stored.

What is replaced (English + Arabic formats):
  EMAIL         addresses
  PHONE         international/local numbers (+966 5x…, 05x…, 00…), labelled phone/mobile/هاتف/جوال numbers
  NATIONAL_ID   Saudi national ID / Iqama (10 digits starting 1 or 2), labelled ID / الهوية / الإقامة values
  PASSPORT      labelled passport numbers (Passport / جواز السفر)
  IBAN          bank account numbers (e.g. SA + 22 digits)
  CARD          payment card numbers (Luhn-valid 13–19 digits)
  PROFILE_URL   personal profile links (LinkedIn, GitHub, X/Twitter, Facebook, Instagram, Telegram, WhatsApp)
  ADDRESS       labelled addresses (Address: / العنوان:), P.O. boxes (ص.ب), street lines
  SECRET        API keys and provider tokens (known prefixes), bearer tokens, JWTs, webhook URLs (Slack, Discord,
                Teams/Office 365, generic token-bearing /webhook/ paths), passwords embedded in URLs, PEM private
                keys, labelled `secret=` / `password:` values and unlabelled high-entropy tokens (see `_is_random_token`)
  NAME          the account holder's known name(s) and labelled "Name:" / "الاسم:" values, plus the CV header line

What is deliberately kept: employers, schools, job titles, skills, project names, dates, and metrics — the AI
tasks need them, and they are what claim verification checks against.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"
D = rf"[0-9{_AR_DIGITS}]"  # digit incl. Arabic-Indic

KINDS = ("EMAIL", "PHONE", "NATIONAL_ID", "PASSPORT", "IBAN", "CARD", "PROFILE_URL", "ADDRESS", "SECRET", "NAME", "DOB")

_SECRET = re.compile(
    r"(?:\b(?:sk|gsk|rk|pk)[-_][A-Za-z0-9_-]{16,}|\bAIza[0-9A-Za-z_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}"
    r"|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|(?i:bearer)\s+[A-Za-z0-9._~+/=-]{16,}"
    # further provider formats: AWS temporary/role keys, Slack app tokens, GitLab, npm, Hugging Face, SendGrid, Stripe
    # webhook signing secrets, Google OAuth access tokens, DigitalOcean, Shopify, Telegram bot tokens (id:secret)
    r"|\b(?:ASIA|AROA|AIDA|AGPA)[0-9A-Z]{16}\b|\bxapp-[A-Za-z0-9-]{10,}|\bglpat-[A-Za-z0-9_-]{20,}|\bnpm_[A-Za-z0-9]{36,}\b"
    r"|\bhf_[A-Za-z0-9]{30,}\b|\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|\bwhsec_[A-Za-z0-9]{20,}|\bya29\.[A-Za-z0-9_-]{20,}"
    r"|\bdop_v1_[a-f0-9]{64}\b|\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b|(?<![\w:])\d{8,10}:AA[A-Za-z0-9_-]{30,}"
    # webhook URLs carry their credential in the path: Slack, Discord, Microsoft Teams / Office 365 connectors
    r"|(?:https?://)?hooks\.slack\.com/(?:services|workflows|triggers)/[^\s,;)\]}>\"']+"
    r"|(?:https?://)?(?:\w+\.)?discord(?:app)?\.com/api/webhooks/[^\s,;)\]}>\"']+"
    r"|(?:https?://)?[\w-]+\.webhook\.office\.com/[^\s,;)\]}>\"']+|(?:https?://)?outlook\.office(?:365)?\.com/webhook/[^\s,;)\]}>\"']+"
    # PEM private keys: the whole block
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)"
)
# any other URL whose path is a webhook endpoint AND carries a token-like segment (>= 20 chars, letters and digits);
# "https://api.example.com/webhooks/stripe" has no credential and is left alone
_WEBHOOK_URL = re.compile(r"(?i)(?:https?://)?[a-z0-9.-]+\.[a-z]{2,}/(?:[^\s/]+/)*(?:webhooks?|hooks?)/[^\s,;)\]}>\"']+")
_WEBHOOK_TOKEN_SEGMENT = re.compile(r"[A-Za-z0-9_-]{20,}")
# scheme://user:password@host -> only the password is a secret (the host and path are kept)
_URL_PASSWORD = re.compile(r"(?i)\b[a-z][a-z0-9+.-]{1,20}://[^\s:/@]{1,64}:([^\s@/]{3,128})@[a-z0-9.-]+")
# key = value / key: value where the key names a credential; the value is redacted only if it looks generated
_LABELLED_SECRET = re.compile(
    r"(?i)\b(?:[a-z0-9]+[_-])*(?:api[_-]?key|apikey|secret(?:[_-]?key)?|client[_-]?secret|access[_-]?(?:key|token)|auth[_-]?token|"
    r"token|password|passwd|pwd|private[_-]?key|signing[_-]?key|webhook[_-]?secret)(?:[_-][a-z0-9]+)*\b[\"']?\s*(?:[:=]|=>)\s*[\"']?"
    r"(?!\[[A-Z_]+_\d)([^\s\"',;]{7,199}[^\s\"',;.:)\]])"  # a value never ends with sentence punctuation
)
# candidate unlabelled tokens: one run of URL-safe/base64 characters
_TOKEN_CANDIDATE = re.compile(r"(?<![\w+/=-])[A-Za-z0-9_+/=-]{32,}(?![\w+/=-])")
_EMAIL = re.compile(r"(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
# obfuscated addresses: name [at] domain [dot] com / name (at) domain (dot) com
_EMAIL_OBF = re.compile(r"(?i)[\w.+-]+\s*[\[(]\s*at\s*[\])]\s*[\w-]+(?:\s*[\[(]\s*dot\s*[\])]\s*[\w-]+)+")
# labelled personal sites + bare personal domains in contact lines
_SITE_LABELLED = re.compile(r"(?i)\b(?:website|portfolio|blog|homepage|personal site|links?)\s*[:：]\s*([^\n]+)")
_DOMAIN = re.compile(r"(?i)(?:https?://)?(?:www\.)?[a-z0-9-]{3,}\.(?:dev|me|io|com|net|org|sa|site|page|app|xyz)(?:/[^\s,;·|]*)?")
_DOB = re.compile(r"(?i)(?:\b(?:date of birth|d\.o\.b\.?|dob|born(?: on)?|birth ?date)|تاريخ الميلاد|مواليد)\s*[:：]?\s*"
                  rf"((?:{D}{{1,2}}[\s/.-]+)?(?:[A-Za-z\u0600-\u06FF]+|{D}{{1,2}})[\s/.-]+{D}{{4}}|{D}{{4}}-{D}{{2}}-{D}{{2}})")
_REFEREE = re.compile(r"(?im)^\s*(?:references?|referees?|المراجع|المعرفون)\s*:?\s*\n((?:Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?|Eng\.?|د\.|م\.)?\s*[^,\n|]{3,60})")
_SA_LOCAL_MOBILE = re.compile(rf"(?<![\w{_AR_DIGITS}+])[5٥]{D}[ -]?{D}{{3}}[ -]?{D}{{4}}(?![\w{_AR_DIGITS}])")
_PROFILE_URL = re.compile(
    r"(?:https?://)?(?:www\.|[a-z]{2}\.)?(?:linkedin\.com/(?:in|pub)/|github\.com/|gitlab\.com/|(?:twitter|x)\.com/|facebook\.com/|"
    r"instagram\.com/|t\.me/|wa\.me/|behance\.net/|medium\.com/@)[^\s,;)\]}>\"']+",
    re.I,
)
_IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b")
_CARD = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")
_PHONE_LABELLED = re.compile(
    rf"(?i:\b(?:phone|mobile|mob|tel|telephone|cell|whatsapp|contact(?: number)?)\b|هاتف|جوال|الجوال|رقم الهاتف|الهاتف|واتساب)"
    rf"\s*[:：.\-]?\s*(\+?{D}[{_AR_DIGITS}0-9 ()./-]{{5,}}{D})"
)
_PHONE = re.compile(rf"(?<![\w{_AR_DIGITS}])(?:\(?\+|00|0|٠٠|٠)(?:[ ().-]?{D}){{8,14}}(?![\w{_AR_DIGITS}])")
# unlabelled 10-digit IDs; not when it is a quantity ("1200000000 events", "SAR 1200000000")
_NATIONAL_ID = re.compile(rf"(?<![\w{_AR_DIGITS}$])(?<!SAR )(?<!USD )[12١٢]{D}{{9}}(?![\w{_AR_DIGITS}])(?![ \t]*(?:[A-Za-z\u0600-\u06FF%]))")
_ID_LABELLED = re.compile(
    r"(?i:\b(?:national id|national identity|iqama|id number|id no\.?|civil id|residence permit|ssn|social security)\b|"
    r"رقم الهوية|الهوية الوطنية|رقم الإقامة|الإقامة|السجل المدني)\s*(?i:number|no\.?|#|رقم)?\s*[:：#\-]?\s*([A-Za-z0-9٠-٩-]{5,20})"
)
_PASSPORT = re.compile(r"(?i:\bpassport\b(?:\s*(?:no\.?|number|#))?|جواز السفر|رقم الجواز)\s*[:：#\-]?\s*([A-Za-z]{0,2}[0-9]{6,9})")
_ADDRESS_LABELLED = re.compile(r"(?im)^\s*(?:(?:home |mailing |postal )?address|العنوان|عنوان السكن)\s*[:：]\s*(.+)$")
_PO_BOX = re.compile(rf"(?i:\bP\.?\s?O\.?\s?Box\s*{D}+|ص\.?\s?ب\.?\s*{D}+)")
_STREET = re.compile(
    rf"(?i)\b{D}{{1,5}}\s+(?:[A-Z][\w'-]+\s){{1,4}}(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.|Lane|Ln\.|Drive|Dr\.)"
    rf"|(?:شارع|حي)\s+[\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){{0,3}}(?:\s*،?\s*{D}{{1,5}})?"
)
_NAME_LABELLED = re.compile(r"(?im)^\s*(?:full name|name|الاسم(?: الكامل)?)\s*[:：]\s*([^\n,|]{2,80})$")
_CV_HEADER_SKIP = re.compile(r"(?i)^(curriculum vitae|resume|résumé|cv|السيرة الذاتية|سيرة ذاتية|personal details|البيانات الشخصية)\b")
_TITLE_WORDS = re.compile(r"(?i)\b(engineer|developer|analyst|manager|designer|scientist|consultant|architect|specialist|officer|"
                          r"director|intern|student|lead|partner|administrator|researcher|teacher|accountant)\b|مهندس|مطور|محلل|مدير|مصمم")
_PLACEHOLDER = re.compile(r"\[(" + "|".join(KINDS) + r")_(\d{1,4})\]")


def _luhn_ok(num: str) -> bool:
    digits = [int(c) for c in num if c.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total, parity = 0, len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _digit_count(s: str) -> int:
    return sum(ch.isdigit() for ch in s)


def _entropy(s: str) -> float:
    """Shannon entropy in bits per character."""
    from collections import Counter
    from math import log2

    n = len(s)
    return -sum(c / n * log2(c / n) for c in Counter(s).values()) if n else 0.0


def _is_random_token(value: str, min_len: int = 32) -> bool:
    """True for a generated credential, False for ordinary long identifiers.

    Kept: camelCase / snake_case identifiers (no digits, or words), hex digests and UUIDs (git SHAs, checksums,
    request IDs are not secrets), file paths, and repeated characters. A secret needs letters in BOTH cases AND digits,
    spread out (no single long letter run), with high entropy."""
    v = value.strip("=")
    if len(v) < min_len or re.fullmatch(r"[0-9a-fA-F-]+", v):
        return False
    if v.count("/") > 2:  # a path, not a token
        return False
    if not (re.search(r"[a-z]", v) and re.search(r"[A-Z]", v) and re.search(r"\d", v)):
        return False
    if _digit_count(v) < 3:
        return False
    if re.search(r"[A-Za-z]{18,}", v):  # a long dictionary-ish run: "useInfiniteScrollPagination…"
        return False
    return _entropy(v) >= 3.8


def _looks_generated(value: str) -> bool:
    """A labelled secret value (`password: …`) that is a real credential, not prose or a placeholder."""
    v = value.strip("\"'")
    if re.fullmatch(r"(?i)(?:<[^>]*>|\$\{?[A-Z0-9_]+\}?|%[A-Z0-9_]+%|x{3,}|\*{3,}|\.{3,}|redacted|changeme|none|null|true|false|"
                    r"your[_-]?\w*|example|placeholder|\[[A-Z_]+_\d+\])", v):
        return False
    if re.fullmatch(r"[A-Za-z]+(?:[ _-][A-Za-z]+)*", v) and not re.search(r"[a-z][A-Z]", v):
        return False  # a plain word or phrase ("rotated", "read-only")
    return bool(re.search(r"\d", v) or re.search(r"[^A-Za-z0-9]", v) or re.search(r"[a-z][A-Z]", v)) and len(v) >= 8


@dataclass
class Redactor:
    """One instance per AI request. `redact` can be called on many texts; placeholders stay consistent."""

    known_names: list[str] = field(default_factory=list)
    cv_header: bool = False  # treat the first line of a document as the holder's name when it looks like one
    _forward: dict[str, str] = field(default_factory=dict)  # original -> placeholder
    _reverse: dict[str, str] = field(default_factory=dict)  # placeholder -> original
    _counts: dict[str, int] = field(default_factory=dict)

    @property
    def count(self) -> int:
        return len(self._reverse)

    def counts_by_kind(self) -> dict[str, int]:
        return dict(self._counts)

    def _token(self, kind: str, original: str) -> str:
        key = original.strip()
        if not key:
            return original
        if key in self._forward:
            return self._forward[key]
        self._counts[kind] = self._counts.get(kind, 0) + 1
        ph = f"[{kind}_{self._counts[kind]}]"
        self._forward[key] = ph
        self._reverse[ph] = key
        return ph

    def _sub(self, pattern: re.Pattern[str], kind: str, text: str, group: int = 0, check=None) -> str:
        def repl(m: re.Match[str]) -> str:
            value = m.group(group)
            if not value or (check and not check(value)):
                return m.group(0)
            if group == 0:
                return self._token(kind, value)
            start, end = m.span(group)
            s0 = m.start(0)
            whole = m.group(0)
            return whole[: start - s0] + self._token(kind, value) + whole[end - s0:]

        return pattern.sub(repl, text)

    def _names(self, text: str) -> list[str]:
        names = [n.strip() for n in self.known_names if n and len(n.strip()) >= 3]
        names += [m.group(1).strip() for m in _NAME_LABELLED.finditer(text)]
        for m in _REFEREE.finditer(text):  # referees' names (third-party personal data)
            n = re.sub(r"^(Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?|Eng\.?|د\.|م\.)\s*", "", m.group(1).strip())
            if 2 <= len(n.split()) <= 4:
                names.append(n)
        if self.cv_header:
            for line in text.splitlines():
                line = line.strip()
                # skip our own prompt scaffolding ("CV text:", <untrusted_data …>) to reach the document's first line
                if not line or re.match(r"(?i)^(<\/?untrusted_data|cv text\s*:|document\s*:)", line):
                    continue
                words = line.split()
                if _CV_HEADER_SKIP.match(line):
                    continue  # "CURRICULUM VITAE" banner: the name is on the next line
                # "Name | email", "Name · title", "Name - email", "Name — title": the name is the first field
                cand = re.split(r"\s*[|,·•‧∙]\s*|\s+[-–—]\s+|\s*[–—]\s*", line)[0].strip()
                words = cand.split()
                from app.ai.skills import find_skills  # local import keeps this module dependency-light

                # two-column PDFs merge "Name Python SQL Tableau" into one line: keep the leading non-skill words
                if find_skills(cand) and len(words) > 2:
                    prefix: list[str] = []
                    for w in words:
                        if find_skills(w):
                            break
                        prefix.append(w)
                    if 2 <= len(prefix) <= 4 and len(prefix) < len(words):
                        cand, words = " ".join(prefix), prefix

                if (
                    2 <= len(words) <= 4
                    and len(cand) <= 60
                    and not any(ch.isdigit() for ch in cand)
                    and not re.search(r"[@/:]", cand)
                    and not _TITLE_WORDS.search(cand)
                    and not find_skills(cand)
                ):
                    names.append(cand)
                break
        # longest first so "Sara Ali Alharbi" is replaced before "Sara Ali"
        return sorted({n for n in names if n}, key=len, reverse=True)

    def redact(self, text: str) -> str:
        if not text:
            return text
        t = text
        t = self._sub(_SECRET, "SECRET", t)
        t = self._sub(_WEBHOOK_URL, "SECRET", t, check=lambda v: bool(_WEBHOOK_TOKEN_SEGMENT.search(re.split(r"(?i)hooks?/", v, maxsplit=1)[-1])))
        t = self._sub(_URL_PASSWORD, "SECRET", t, group=1)
        t = self._sub(_LABELLED_SECRET, "SECRET", t, group=1, check=_looks_generated)
        t = self._sub(_TOKEN_CANDIDATE, "SECRET", t, check=_is_random_token)
        t = self._sub(_EMAIL, "EMAIL", t)
        t = self._sub(_EMAIL_OBF, "EMAIL", t)
        t = self._sub(_PROFILE_URL, "PROFILE_URL", t)
        t = _SITE_LABELLED.sub(lambda m: m.group(0).replace(m.group(1), _DOMAIN.sub(lambda d: self._token("PROFILE_URL", d.group(0)), m.group(1))), t)
        t = self._sub(_DOB, "DOB", t, group=1)
        t = self._sub(_PASSPORT, "PASSPORT", t, group=1)
        t = self._sub(_ID_LABELLED, "NATIONAL_ID", t, group=1, check=lambda v: _digit_count(v) >= 5)
        t = self._sub(_IBAN, "IBAN", t, check=lambda v: _digit_count(v) >= 12)
        t = self._sub(_CARD, "CARD", t, check=_luhn_ok)
        t = self._sub(_PHONE_LABELLED, "PHONE", t, group=1, check=lambda v: _digit_count(v) >= 7)
        t = self._sub(_PHONE, "PHONE", t, check=lambda v: 9 <= _digit_count(v) <= 15)
        t = self._sub(_SA_LOCAL_MOBILE, "PHONE", t)
        t = self._sub(_NATIONAL_ID, "NATIONAL_ID", t)
        t = self._sub(_ADDRESS_LABELLED, "ADDRESS", t, group=1)
        t = self._sub(_PO_BOX, "ADDRESS", t)
        t = self._sub(_STREET, "ADDRESS", t)
        for name in self._names(text):
            pat = re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)", re.I)
            if pat.search(t):
                t = pat.sub(self._token("NAME", name), t)
        return t

    def restore(self, text: str) -> str:
        """Put original values back into model output (local only)."""
        if not text or not self._reverse:
            return text
        return _PLACEHOLDER.sub(lambda m: self._reverse.get(m.group(0), m.group(0)), text)


def redact_for_logs(text: str, limit: int = 300) -> str:
    """One-way scrub for error logs / alert payloads (no mapping kept)."""
    r = Redactor()
    return r.redact(text or "")[:limit]


def contains_pii(text: str, known_names: list[str] | None = None) -> list[str]:
    """Kinds of PII detected in text (used by tests and the outbound-payload guard)."""
    r = Redactor(known_names=known_names or [])
    r.redact(text or "")
    return sorted(r.counts_by_kind())
