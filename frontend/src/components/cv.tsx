"use client";

/* Barrel for the CV components (implementation lives in components/cv/). Kept for existing imports. */
import type { CVData } from "@/lib/types";
import { CVDocument } from "./cv/document";

export { CVDocument, type DocMarks } from "./cv/document";
export { CVEditor, TagInput } from "./cv/editor";
export { ExportButtons, TailoredList, VersionList } from "./cv/history";
export { changedSections, cleanCV, EMPTY_CV, normalizeCV, sameCV } from "./cv/model";
export { ChangeDiff, SuggestionReview } from "./cv/suggestions";

type LegacyHighlight = { ids?: Set<string>; bullets?: Set<string>; skills?: Set<string>; summary?: boolean };

/** Legacy API: CVView({ data, highlight }) — renders the new print-like document. */
export function CVView({ data, highlight, className }: { data: CVData; highlight?: LegacyHighlight; className?: string }) {
  return (
    <CVDocument
      data={data}
      className={className}
      compact
      marks={highlight ? { tone: "change", changedIds: highlight.ids, bullets: highlight.bullets, skills: highlight.skills, summary: highlight.summary } : undefined}
    />
  );
}
