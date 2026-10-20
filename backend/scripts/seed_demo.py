"""Create a LOCAL demo account with a sample Master CV (clearly labelled sample data).

Usage (from backend/):  python -m scripts.seed_demo
Only for AUTH_MODE=local development databases. The sample CV is fictional.
"""
from __future__ import annotations

from sqlalchemy import select

from app.db import SessionLocal, init_db
from app.models import CV, CVVersion, User
from app.security.auth import hash_password

DEMO_EMAIL = "demo@wasl.test"
DEMO_PASSWORD = "WaslDemo!2026"  # local test-only credential

SAMPLE_CV = {
    "contact": {"full_name": "Demo Candidate (sample)", "headline": "AI Engineer", "email": DEMO_EMAIL, "phone": "", "location": "Riyadh",
                "links": []},
    "summary": "AI student building practical machine learning and web applications.",
    "experience": [{"id": "exp-demo1", "title": "AI Intern", "organization": "Sample Research Center", "location": "Riyadh",
                    "start": "2026-06", "end": "2026-09",
                    "bullets": ["Built a FastAPI service in Python to classify documents", "Wrote SQL queries to prepare training data"]}],
    "education": [{"id": "edu-demo1", "degree": "BSc Artificial Intelligence", "institution": "Umm Al-Qura University", "start": "2023",
                   "end": "2027", "details": ""}],
    "projects": [{"id": "prj-demo1", "name": "Pneumonia detection", "description": "CNN classifier for chest X-rays",
                  "technologies": ["TensorFlow", "Python"], "bullets": ["Trained and evaluated a CNN on a public chest X-ray dataset"], "link": ""}],
    "certifications": [], "awards": [],
    "skills": ["Python", "SQL", "FastAPI", "TensorFlow", "Docker", "Git"],
    "languages": ["Arabic", "English"],
}


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD), full_name="Demo Candidate", headline="AI Engineer")
            db.add(user)
            db.flush()
        if not db.scalar(select(CV).where(CV.user_id == user.id, CV.kind == "master")):
            cv = CV(user_id=user.id, kind="master", title="Master CV", data=SAMPLE_CV, version=1)
            db.add(cv)
            db.flush()
            db.add(CVVersion(cv_id=cv.id, user_id=user.id, version=1, data=SAMPLE_CV, change_summary="Sample CV (seed)"))
        db.commit()
        print(f"Demo account ready: {DEMO_EMAIL} (password in scripts/seed_demo.py)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
