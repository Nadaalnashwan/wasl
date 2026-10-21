"""Pydantic schemas: the structured CV format and every AI structured output."""
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _id() -> str:
    return uuid.uuid4().hex[:10]


# ------------------------------------------------------------------ structured CV
class Contact(BaseModel):
    full_name: str = ""
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: list[str] = Field(default_factory=list)


class ExperienceItem(BaseModel):
    id: str = Field(default_factory=_id)
    title: str = ""
    organization: str = ""
    location: str = ""
    start: str = ""
    end: str = ""
    bullets: list[str] = Field(default_factory=list)


class EducationItem(BaseModel):
    id: str = Field(default_factory=_id)
    degree: str = ""
    institution: str = ""
    start: str = ""
    end: str = ""
    details: str = ""


class ProjectItem(BaseModel):
    id: str = Field(default_factory=_id)
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    bullets: list[str] = Field(default_factory=list)
    link: str = ""
    achievement_id: str | None = None


class CertificationItem(BaseModel):
    id: str = Field(default_factory=_id)
    name: str = ""
    issuer: str = ""
    date: str = ""
    achievement_id: str | None = None


class AwardItem(BaseModel):
    id: str = Field(default_factory=_id)
    title: str = ""
    issuer: str = ""
    date: str = ""
    description: str = ""
    achievement_id: str | None = None


class CVData(BaseModel):
    contact: Contact = Field(default_factory=Contact)
    summary: str = ""
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[CertificationItem] = Field(default_factory=list)
    awards: list[AwardItem] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ AI outputs
Tone = Literal["professional", "inspiring", "storytelling", "concise", "humble", "technical"]


class GeneratedPost(BaseModel):
    content: str = Field(min_length=40, max_length=3000)
    hashtags: list[str] = Field(default_factory=list, max_length=8)
    facts_used: list[str] = Field(default_factory=list, description="Facts from the input that the post relies on")

    @field_validator("hashtags")
    @classmethod
    def _clean_tags(cls, v: list[str]) -> list[str]:
        return [("#" + t.lstrip("#").replace(" ", "")) for t in v if t.strip("# ")]


class ExtractedAchievement(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=1500)
    category: Literal["project", "certification", "experience", "award", "education"] = "project"
    technologies: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    impact: str = ""
    evidence_quotes: list[str] = Field(default_factory=list, description="Short verbatim quotes from the source")
    confidence: float = Field(default=0.5, ge=0, le=1)
    needs_contribution_confirmation: bool = False
    contribution_question: str = ""
    occurred_on: str = ""


class AchievementExtraction(BaseModel):
    achievements: list[ExtractedAchievement] = Field(default_factory=list, max_length=8)
    no_achievement_reason: str = ""


class CVChange(BaseModel):
    section: Literal["projects", "experience", "certifications", "awards", "skills", "education"]
    action: Literal["add_item", "add_bullet", "add_skills"]
    target_id: str | None = None  # for add_bullet
    item: dict = Field(default_factory=dict)  # for add_item (fields of the section item)
    bullet: str = ""
    skills: list[str] = Field(default_factory=list)
    reason: str = ""


class CVUpdateProposal(BaseModel):
    changes: list[CVChange] = Field(default_factory=list, max_length=6)
    rationale: str = ""


class Requirement(BaseModel):
    skill: str
    kind: Literal["technical", "soft", "domain", "credential", "experience"] = "technical"


class JobRequirements(BaseModel):
    job_title: str = ""
    company: str = ""
    seniority: str = ""
    must_have: list[Requirement] = Field(default_factory=list)
    nice_to_have: list[Requirement] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)


class TailoredSection(BaseModel):
    id: str
    bullets: list[str] = Field(default_factory=list)


class TailoredCV(BaseModel):
    summary: str = ""
    skills_order: list[str] = Field(default_factory=list)
    experience: list[TailoredSection] = Field(default_factory=list)
    projects: list[TailoredSection] = Field(default_factory=list)
    highlighted_item_ids: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class LearningStep(BaseModel):
    skill: str
    priority: Literal["high", "medium", "low"] = "medium"
    why: str = ""
    resources: list[str] = Field(default_factory=list)
    practice_project: str = ""
    evidence_to_add: str = ""
    est_weeks: int = Field(default=2, ge=0, le=52)


class GapRoadmap(BaseModel):
    overview: str = ""
    steps: list[LearningStep] = Field(default_factory=list, max_length=12)
    quick_wins: list[str] = Field(default_factory=list)


# ------------------------------------------------------------------ job recommendations
Seniority = Literal["internship", "entry", "mid", "senior"]


class JobSearchProfile(BaseModel):
    target_titles: list[str] = Field(default_factory=list, max_length=4, description="Concrete market job titles, most suitable first")
    seniority: Seniority = "entry"
    key_skills: list[str] = Field(default_factory=list, max_length=12)
    include_internships: bool = False
    rationale: str = ""

    @field_validator("target_titles", "key_skills")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(s.strip() for s in v if s and s.strip()))


class ListingRequirements(BaseModel):
    ref: str
    must_have: list[str] = Field(default_factory=list, max_length=12)
    nice_to_have: list[str] = Field(default_factory=list, max_length=8)
    min_years: int | None = Field(default=None, ge=0, le=30)
    education: str = ""
    level: Seniority | Literal["unknown"] = "unknown"


class ListingRequirementsBatch(BaseModel):
    jobs: list[ListingRequirements] = Field(default_factory=list, max_length=8)
