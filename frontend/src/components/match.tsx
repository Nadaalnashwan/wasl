"use client";

/* Barrel for match/score components (implementation lives in components/career/). Kept for existing imports. */
import type { SkillMatch } from "@/lib/types";
import { EvidenceMatrix } from "./career/requirements";

export { ScoreExplain, ScoreSummary } from "./career/score";
export { EvidenceMatrix, RequirementsList, SourceTag, STATUS_META } from "./career/requirements";
export { AnalysisHistory, TailorHistory } from "./career/history";

/** Legacy name: requirement-vs-evidence view. */
export function SkillColumns({ must, nice }: { must: SkillMatch[]; nice: SkillMatch[] }) {
  return <EvidenceMatrix must={must} nice={nice} />;
}
