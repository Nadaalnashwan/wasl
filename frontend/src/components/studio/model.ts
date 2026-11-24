import type { ClaimReport } from "@/components/claims";
import type { Achievement, Post } from "@/lib/types";

export const TONES = ["professional", "inspiring", "storytelling", "concise", "humble", "technical"] as const;
export type Tone = (typeof TONES)[number];

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_HASHTAGS = 8;
export const MAX_CONTENT = 3000;

export type PostImage = { id: string; filename: string; mime: string; size_bytes: number; url: string };
export type StudioPost = Omit<Post, "claim_check"> & { images: PostImage[]; claim_check: Partial<ClaimReport> & Record<string, unknown> };

export type EvaluationResult = { candidates: Achievement[]; no_achievement_reason: string; injection_flags?: string[] };

export type Improved = { content: string; hashtags: string[]; claim_check: ClaimReport };

export type SourceMode = "achievement" | "describe" | "improve";

/** Statuses the publish endpoint treats as blocking (backend app/ai/claims.py BLOCKING). */
const BLOCKING = new Set(["unsupported", "contradicted", "needs_confirmation", "unavailable"]);

/** Claim report or null when the post carries none (old rows can have `{}`). */
export function asReport(c: unknown): ClaimReport | null {
  if (!c || typeof c !== "object") return null;
  const r = c as ClaimReport;
  return typeof r.claims_checked === "number" ? r : null;
}

/** Number of claims that must be resolved or explicitly acknowledged before publishing. */
export function blockingCount(r: ClaimReport | null): number {
  if (!r) return 0;
  const explicit = (r as ClaimReport & { blocking_count?: number }).blocking_count;
  if (typeof explicit === "number") return explicit;
  if (r.claims?.length) return r.claims.filter((c) => BLOCKING.has(c.status)).length;
  return r.unsupported_count ?? r.unsupported?.length ?? 0;
}

/** Exactly what the backend sends to LinkedIn: content + blank line + hashtags. */
export function finalText(content: string, hashtags: string[]) {
  return content + (hashtags.length ? "\n\n" + hashtags.join(" ") : "");
}

export function normalizeTag(raw: string) {
  const t = raw.trim().replace(/^#+/, "").replace(/[\s#]+/g, "");
  return t ? `#${t}` : "";
}

export const isEditable = (p: StudioPost | null) => !!p && !["published", "publishing", "uncertain"].includes(p.status);

/** "{n} claims" style placeholders for i18n strings. */
export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
