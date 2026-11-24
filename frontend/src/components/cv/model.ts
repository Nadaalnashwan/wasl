/* Pure helpers for the structured CV (mirrors backend app/ai/schemas.py CVData). No React here. */
import type { CVData } from "@/lib/types";

export const EMPTY_CV: CVData = {
  contact: { full_name: "", headline: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  experience: [],
  education: [],
  projects: [],
  certifications: [],
  awards: [],
  skills: [],
  languages: [],
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Fill every missing field so components never deal with undefined arrays/strings. */
export function normalizeCV(d: Partial<CVData> | null | undefined): CVData {
  const src = (d || {}) as Partial<CVData>;
  const c = (src.contact || {}) as Partial<CVData["contact"]>;
  return {
    contact: {
      full_name: str(c.full_name),
      headline: str(c.headline),
      email: str(c.email),
      phone: str(c.phone),
      location: str(c.location),
      links: arr<string>(c.links),
    },
    summary: str(src.summary),
    experience: arr<CVData["experience"][number]>(src.experience).map((e) => ({
      ...e,
      id: str(e.id),
      title: str(e.title),
      organization: str(e.organization),
      location: str(e.location),
      start: str(e.start),
      end: str(e.end),
      bullets: arr<string>(e.bullets),
    })),
    education: arr<CVData["education"][number]>(src.education).map((e) => ({
      ...e,
      id: str(e.id),
      degree: str(e.degree),
      institution: str(e.institution),
      start: str(e.start),
      end: str(e.end),
      details: str(e.details),
    })),
    projects: arr<CVData["projects"][number]>(src.projects).map((p) => ({
      ...p,
      id: str(p.id),
      name: str(p.name),
      description: str(p.description),
      technologies: arr<string>(p.technologies),
      bullets: arr<string>(p.bullets),
      link: str(p.link),
    })),
    certifications: arr<CVData["certifications"][number]>(src.certifications).map((c2) => ({
      ...c2,
      id: str(c2.id),
      name: str(c2.name),
      issuer: str(c2.issuer),
      date: str(c2.date),
    })),
    awards: arr<CVData["awards"][number]>(src.awards).map((a) => ({
      ...a,
      id: str(a.id),
      title: str(a.title),
      issuer: str(a.issuer),
      date: str(a.date),
      description: str(a.description),
    })),
    skills: arr<string>(src.skills),
    languages: arr<string>(src.languages),
  };
}

/** Remove blank bullets / tags and trim text before saving. */
export function cleanCV(d: CVData): CVData {
  const cv = normalizeCV(d);
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return {
    ...cv,
    contact: { ...cv.contact, links: list(cv.contact.links) },
    summary: cv.summary.trim(),
    experience: cv.experience.map((e) => ({ ...e, bullets: list(e.bullets) })),
    projects: cv.projects.map((p) => ({ ...p, bullets: list(p.bullets), technologies: list(p.technologies) })),
    skills: list(cv.skills),
    languages: list(cv.languages),
  };
}

/** Short random id for new items (call from event handlers only). */
export function newItemId() {
  return Math.random().toString(16).slice(2, 12);
}

export type ListKey = "experience" | "education" | "projects" | "certifications" | "awards";
export type SectionKey = "contact" | "summary" | ListKey | "skills" | "languages";

/** Editor + document order. */
export const SECTION_ORDER: SectionKey[] = [
  "contact",
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
  "certifications",
  "awards",
  "languages",
];

export function sameCV(a: CVData | null | undefined, b: CVData | null | undefined) {
  return JSON.stringify(normalizeCV(a)) === JSON.stringify(normalizeCV(b));
}

/** Which sections differ between two CVs (real, field-level comparison). */
export function changedSections(before: CVData | null | undefined, after: CVData | null | undefined): SectionKey[] {
  const a = normalizeCV(before);
  const b = normalizeCV(after);
  return SECTION_ORDER.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export function isEmptyCV(d: CVData | null | undefined) {
  return sameCV(cleanCV(normalizeCV(d)), EMPTY_CV);
}

/** Find an item in any list section by id. */
export function findItem(cv: CVData, id: string | undefined | null): { section: ListKey; item: Record<string, unknown> } | null {
  if (!id) return null;
  for (const k of ["experience", "education", "projects", "certifications", "awards"] as ListKey[]) {
    const it = (cv[k] as unknown as Record<string, unknown>[]).find((x) => x.id === id);
    if (it) return { section: k, item: it };
  }
  return null;
}

export function itemHeading(section: ListKey, it: Record<string, unknown>): { title: string; sub: string } {
  const s = (k: string) => str(it[k]);
  switch (section) {
    case "experience":
      return { title: s("title"), sub: s("organization") };
    case "education":
      return { title: s("degree"), sub: s("institution") };
    case "projects":
      return { title: s("name"), sub: arr<string>(it.technologies).join(", ") };
    case "certifications":
      return { title: s("name"), sub: s("issuer") };
    case "awards":
      return { title: s("title"), sub: s("issuer") };
  }
}

export function dateRange(start?: string, end?: string) {
  return [start, end].filter((x) => x && x.trim()).join(" – ");
}
