"""Skill lexicon + deterministic, explainable skill matching.

Matching is intentionally NOT done by the LLM: a reviewer can trace every match to a rule
(canonical name / alias) and to the CV section where the evidence was found.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# canonical -> aliases (lowercase). Kept compact; extend freely.
LEXICON: dict[str, list[str]] = {
    "Python": ["python", "python3"], "JavaScript": ["javascript", "js", "ecmascript"],
    "TypeScript": ["typescript", "ts"], "Java": ["java"], "C++": ["c++", "cpp"], "C#": ["c#", "csharp", ".net"],
    "Go": ["golang", "go lang"], "Rust": ["rust"], "SQL": ["sql", "t-sql", "pl/sql"], "R": ["r language", "rstudio"],
    "Kotlin": ["kotlin"], "Swift": ["swift"], "PHP": ["php"], "Dart": ["dart"], "Bash": ["bash", "shell scripting"],
    "React": ["react", "react.js", "reactjs"], "Next.js": ["next.js", "nextjs"], "Vue": ["vue", "vue.js"],
    "Angular": ["angular"], "Node.js": ["node.js", "nodejs", "node"], "Express": ["express", "express.js"],
    "FastAPI": ["fastapi"], "Django": ["django"], "Flask": ["flask"], "Spring": ["spring boot", "spring"],
    "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"], "HTML/CSS": ["html", "css", "html5", "css3"],
    "Flutter": ["flutter"], "React Native": ["react native"],
    "PostgreSQL": ["postgresql", "postgres"], "MySQL": ["mysql"], "MongoDB": ["mongodb", "mongo"],
    "Redis": ["redis"], "Supabase": ["supabase"], "Firebase": ["firebase"], "SQLite": ["sqlite"],
    "Docker": ["docker", "dockerfile", "containers"], "Kubernetes": ["kubernetes", "k8s"],
    "AWS": ["aws", "amazon web services", "ec2", "s3", "lambda"], "Azure": ["azure"], "GCP": ["gcp", "google cloud"],
    "CI/CD": ["ci/cd", "github actions", "gitlab ci", "jenkins", "continuous integration"], "Git": ["git", "github", "gitlab"],
    "Linux": ["linux", "ubuntu"], "Terraform": ["terraform"],
    "Machine Learning": ["machine learning", "ml", "تعلم الآلة"], "Deep Learning": ["deep learning", "neural network", "neural networks", "التعلم العميق"],
    "NLP": ["nlp", "natural language processing", "معالجة اللغة"], "Computer Vision": ["computer vision", "image classification", "object detection", "yolo", "الرؤية الحاسوبية"],
    "LLMs": ["llm", "llms", "large language model", "large language models", "gpt", "generative ai", "genai"],
    "RAG": ["rag", "retrieval augmented generation", "retrieval-augmented generation"],
    "LangChain": ["langchain"], "LangGraph": ["langgraph"], "Prompt Engineering": ["prompt engineering"],
    "PyTorch": ["pytorch", "torch"], "TensorFlow": ["tensorflow", "keras"], "scikit-learn": ["scikit-learn", "sklearn"],
    "Pandas": ["pandas"], "NumPy": ["numpy"], "Data Analysis": ["data analysis", "data analytics", "تحليل البيانات"],
    "Data Visualization": ["data visualization", "tableau", "power bi", "matplotlib", "dashboards"],
    "Statistics": ["statistics", "statistical", "الإحصاء"], "MLOps": ["mlops", "model deployment", "mlflow"],
    "Hugging Face": ["hugging face", "huggingface", "transformers"], "OpenCV": ["opencv"],
    "REST APIs": ["rest", "rest api", "restful", "api development", "apis"], "GraphQL": ["graphql"],
    "Microservices": ["microservices", "microservice"], "System Design": ["system design", "distributed systems"],
    "Testing": ["unit testing", "pytest", "jest", "testing", "test automation"], "Agile": ["agile", "scrum", "kanban"],
    "Cybersecurity": ["cybersecurity", "security", "penetration testing", "الأمن السيبراني"],
    "UI/UX Design": ["ui/ux", "ux", "ui design", "figma", "user experience"],
    "Project Management": ["project management", "pmp", "إدارة المشاريع"],
    "Leadership": ["leadership", "led a team", "team lead", "القيادة"], "Communication": ["communication", "presentation skills", "التواصل"],
    "Teamwork": ["teamwork", "collaboration", "cross-functional", "العمل الجماعي"],
    "Problem Solving": ["problem solving", "problem-solving"], "Mentoring": ["mentoring", "mentored", "coaching"],
    "AI Ethics": ["ai ethics", "responsible ai", "أخلاقيات الذكاء الاصطناعي"], "Monitoring": ["monitoring", "observability", "prometheus", "grafana"],
}

_ALIAS_TO_CANON: dict[str, str] = {}
for canon, aliases in LEXICON.items():
    _ALIAS_TO_CANON[canon.lower()] = canon
    for a in aliases:
        _ALIAS_TO_CANON[a] = canon

# aliases that are too ambiguous to match inside free text (only accepted as exact skill entries)
_AMBIGUOUS = {"go", "r", "ts", "js", "ml", "rest", "node", "spring", "security", "testing", "statistical", "apis", "swift", "rust", "dart", "express", "containers", "communication"}


def canonical(skill: str) -> str:
    s = skill.strip().lower()
    return _ALIAS_TO_CANON.get(s, skill.strip())


def _pattern(alias: str) -> re.Pattern[str]:
    return re.compile(r"(?<![\w+#./-])" + re.escape(alias) + r"(?![\w+#-])", re.I)


_PATTERNS = [(a, c, _pattern(a)) for a, c in _ALIAS_TO_CANON.items() if a not in _AMBIGUOUS]


def find_skills(text: str) -> set[str]:
    """Canonical skills mentioned in free text (conservative)."""
    found = set()
    for _alias, canon, pat in _PATTERNS:
        if pat.search(text):
            found.add(canon)
    return found


@dataclass
class SkillEvidence:
    skill: str
    status: str  # verified | unverified | missing
    sources: list[str]  # e.g. ["experience: ML Engineer @ X", "certifications: AWS ..."]
    explanation: str


def cv_evidence_index(cv: dict, confirmed_achievements: list[dict] | None = None) -> tuple[dict[str, list[str]], set[str]]:
    """Return (skill -> evidence sources from experience/projects/certs/education/achievements, skills listed only)."""
    index: dict[str, list[str]] = {}

    def add(text: str, label: str) -> None:
        for s in find_skills(text):
            index.setdefault(s, [])
            if label not in index[s]:
                index[s].append(label)

    for e in cv.get("experience", []):
        add(" ".join([e.get("title", ""), *e.get("bullets", [])]), f"experience: {e.get('title', '')} @ {e.get('organization', '')}".strip())
    for p in cv.get("projects", []):
        add(" ".join([p.get("name", ""), p.get("description", ""), " ".join(p.get("technologies", [])), *p.get("bullets", [])]), f"project: {p.get('name', '')}")
        for t in p.get("technologies", []):
            c = canonical(t)
            index.setdefault(c, [])
            if f"project: {p.get('name', '')}" not in index[c]:
                index[c].append(f"project: {p.get('name', '')}")
    for c in cv.get("certifications", []):
        add(c.get("name", ""), f"certification: {c.get('name', '')}")
    for ed in cv.get("education", []):
        add(" ".join([ed.get("degree", ""), ed.get("details", "")]), f"education: {ed.get('degree', '')}")
    for a in confirmed_achievements or []:
        label = f"achievement: {a.get('title', '')}"
        add(" ".join([a.get("title", ""), a.get("description", "")]), label)
        for t in [*a.get("technologies", []), *a.get("skills", [])]:
            c = canonical(t)
            index.setdefault(c, [])
            if label not in index[c]:
                index[c].append(label)
    listed = {canonical(s) for s in cv.get("skills", [])}
    listed |= find_skills(cv.get("summary", ""))
    return index, listed


def match_requirements(requirements: list[dict], cv: dict, achievements: list[dict] | None = None,
                       evidence_index: tuple[dict[str, list[str]], set[str]] | None = None) -> list[SkillEvidence]:
    """`evidence_index` lets callers scoring many jobs build cv_evidence_index once."""
    index, listed = evidence_index or cv_evidence_index(cv, achievements)
    lower_index = {k.lower(): v for k, v in index.items()}
    lower_listed = {s.lower() for s in listed}
    out = []
    for req in requirements:
        raw = req["skill"]
        canon = canonical(raw)
        key = canon.lower()
        # also try lexicon detection inside multi-word requirement text ("experience with PyTorch")
        detected = find_skills(raw)
        keys = {key, *(d.lower() for d in detected)}
        sources = [src for k in keys for src in lower_index.get(k, [])]
        if sources:
            out.append(SkillEvidence(canon, "verified", sources[:4], f"Found in {len(sources)} CV section(s) with concrete context."))
        elif keys & lower_listed:
            out.append(SkillEvidence(canon, "unverified", ["skills list"], "Listed as a skill, but no experience, project, certification or confirmed achievement demonstrates it."))
        else:
            out.append(SkillEvidence(canon, "missing", [], "Not found anywhere in your CV or confirmed achievements."))
    return out


def match_score(must: list[SkillEvidence], nice: list[SkillEvidence]) -> dict:
    """Explainable score: must-have weight 2, nice-to-have weight 1; verified=1, unverified=0.5, missing=0."""
    credit = {"verified": 1.0, "unverified": 0.5, "missing": 0.0}
    got = sum(2 * credit[e.status] for e in must) + sum(credit[e.status] for e in nice)
    total = 2 * len(must) + len(nice)
    score = round(100 * got / total) if total else 0
    return {
        "score": score,
        "formula": "(2×must-have credit + nice-to-have credit) ÷ (2×#must + #nice); verified=1, unverified=0.5, missing=0",
        "points": round(got, 1),
        "max_points": total,
        "must_have": {s: sum(1 for e in must if e.status == s) for s in credit},
        "nice_to_have": {s: sum(1 for e in nice if e.status == s) for s in credit},
    }
