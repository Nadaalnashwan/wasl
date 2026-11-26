/*
 * Evidence review: pure helpers (no React). The verifier's own statuses and blocking rules stay in the backend;
 * this file only groups them for people, locates each claim in the post, and proposes *safer* wording.
 *
 * Suggestions only ever remove or soften wording ("led" -> "contributed to", drop the clause with the number).
 * They never add a fact, so they cannot invent evidence, and they are applied only when the user clicks.
 */
import type { ClaimReport, ClaimStatus, VerifiedClaim } from "@/components/claims";
import { isArabic } from "@/lib/utils";

/** The three statuses people see. Missing evidence is "unsupported", never "false". */
export type ReviewStatus = "supported" | "review" | "unsupported";

export function reviewStatus(s: ClaimStatus): ReviewStatus {
  if (s === "supported") return "supported";
  if (s === "unsupported" || s === "contradicted") return "unsupported";
  return "review"; // ambiguous, needs_confirmation, unavailable: the evidence can't settle it either way
}

export type Breakdown = Record<ReviewStatus, number> & { total: number };

export function breakdown(report: ClaimReport | null): Breakdown {
  const b: Breakdown = { supported: 0, review: 0, unsupported: 0, total: 0 };
  for (const c of report?.claims ?? []) {
    b[reviewStatus(c.status)] += 1;
    b.total += 1;
  }
  return b;
}

/** Stable identity for a claim across re-checks (ids like "c3" are renumbered every time). */
export function claimKey(c: VerifiedClaim): string {
  return `${c.kind}|${(c.value || "").toLowerCase()}|${c.text.slice(0, 80).toLowerCase()}`;
}

/** The searchable part of a claim's value: "900 people" -> "900", "40%" -> "40%", "FastAPI" -> "FastAPI". */
export function phraseToken(c: VerifiedClaim): string {
  const v = (c.value || "").trim();
  if (c.kind === "number") {
    const m = v.match(/[\d٠-٩][\d٠-٩,.]*\s*%?/);
    if (m) return m[0].trim();
  }
  return v;
}

const SENTENCE_END = /[.!?؟\n]/;

function sentenceBounds(content: string, at: number): { start: number; end: number } {
  let start = at;
  while (start > 0 && !SENTENCE_END.test(content[start - 1])) start--;
  while (start < at && /\s/.test(content[start])) start++;
  let end = at;
  while (end < content.length && !SENTENCE_END.test(content[end])) end++;
  if (end < content.length && content[end] !== "\n") end++; // keep the full stop
  return { start, end };
}

function indexOfCI(hay: string, needle: string, from = 0): number {
  if (!needle) return -1;
  return hay.toLowerCase().indexOf(needle.toLowerCase(), from);
}

export type Located = { start: number; end: number; phraseStart: number; phraseEnd: number };

/** Where the claim sits in the current text, or null when the sentence has since been edited away. */
export function locateClaim(content: string, c: VerifiedClaim): Located | null {
  const text = (c.text || "").trim();
  const token = phraseToken(c);
  let range: { start: number; end: number } | null = null;
  if (text) {
    const exact = content.indexOf(text);
    if (exact >= 0) range = { start: exact, end: exact + text.length };
    else if (text.length >= 40) {
      const pre = content.indexOf(text.slice(0, 40));
      if (pre >= 0) range = sentenceBounds(content, pre + 39);
    }
  }
  if (!range && token) {
    const at = indexOfCI(content, token);
    if (at >= 0) range = sentenceBounds(content, at);
  }
  if (!range) return null;
  const local = token ? indexOfCI(content.slice(range.start, range.end), token) : -1;
  const phraseStart = local >= 0 ? range.start + local : range.start;
  const phraseEnd = local >= 0 ? phraseStart + token.length : range.end;
  return { ...range, phraseStart, phraseEnd };
}

/** Which claim (if any) covers a caret position in the editor; flagged claims win over supported ones. */
export function claimAt(content: string, claims: VerifiedClaim[], pos: number): VerifiedClaim | null {
  let best: VerifiedClaim | null = null;
  for (const c of claims) {
    const loc = locateClaim(content, c);
    if (!loc || pos < loc.start || pos > loc.end) continue;
    if (!best || (reviewStatus(best.status) === "supported" && reviewStatus(c.status) !== "supported")) best = c;
  }
  return best;
}

export type Suggestion = { type: "rewrite"; text: string } | { type: "remove" } | null;

// Arabic "و" is written attached to the next word ("وقت" starts with the same letter), so Arabic splits only on "،".
const CLAUSE_SPLIT = /(,\s+|;\s+|\s+and\s+|\s+but\s+|\s+while\s+|،\s*)/;

function tidy(s: string, terminal: string): string {
  let out = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;!?،؟])/g, "$1").replace(/^[,;،\s]+|[,;،\s]+$/g, "");
  if (!out) return "";
  if (/^[a-z]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  if (!/[.!?؟]$/.test(out)) out += terminal;
  return out;
}

/** Drop the clause that carries the flagged phrase, keeping the rest of the sentence. */
function withoutClause(sentence: string, token: string): Suggestion {
  const terminal = (sentence.trim().match(/[.!?؟]$/) || ["."])[0];
  const body = sentence.trim().replace(/[.!?؟]$/, "");
  const parts = body.split(CLAUSE_SPLIT);
  // parts alternate: clause, delimiter, clause, delimiter, …
  const clauses = parts.filter((_, i) => i % 2 === 0);
  const hit = clauses.findIndex((cl) => indexOfCI(cl, token) >= 0);
  if (hit < 0 || clauses.length < 2) return { type: "remove" };
  // rebuild without the flagged clause; each kept clause keeps the delimiter that preceded it (none for the first)
  const kept: string[] = [];
  clauses.forEach((cl, ci) => {
    if (ci === hit) return;
    if (kept.length) kept.push(parts[2 * ci - 1] ?? " ");
    kept.push(cl);
  });
  // "Python, FastAPI and Docker" minus Docker reads "Python and FastAPI", not "Python, FastAPI"
  if (hit === clauses.length - 1 && kept.length >= 3 && /\s+and\s+/.test(parts[2 * hit - 1] ?? "")) kept[kept.length - 2] = " and ";
  const text = tidy(kept.join(""), terminal);
  return text.length >= 12 ? { type: "rewrite", text } : { type: "remove" };
}

/** A safer version of the sentence for this claim, built only by removing or softening words. */
export function suggest(sentence: string, c: VerifiedClaim): Suggestion {
  const reasons = new Set(c.reasons);
  const ar = isArabic(sentence);
  const value = (c.value || "").trim();
  if (reasons.has("verifier_unavailable")) return null;

  if (reasons.has("role_inflated") && value && indexOfCI(sentence, value) >= 0) {
    const at = indexOfCI(sentence, value);
    const softer = ar ? "ساهمت في" : "contributed to";
    return { type: "rewrite", text: sentence.slice(0, at) + softer + sentence.slice(at + value.length) };
  }
  if (reasons.has("team_vs_individual") && !ar && /\bI\b/.test(sentence)) {
    return { type: "rewrite", text: sentence.replace(/\bI\b/, "We").replace(/\bmy\b/, "our") };
  }
  // contribution not confirmed yet / attribution: rewording can't fix it reliably; the advice explains what to do
  if (reasons.has("contribution_unconfirmed")) return null;

  const token = phraseToken(c);
  return token ? withoutClause(sentence, token) : null;
}

/** Remove a sentence and tidy the whitespace it leaves behind. */
export function removeRange(content: string, start: number, end: number): string {
  const before = content.slice(0, start).replace(/[ \t]+$/, "");
  const after = content.slice(end).replace(/^[ \t]+/, "");
  const joiner = before && after && !before.endsWith("\n") && !after.startsWith("\n") ? " " : "";
  return (before + joiner + after).replace(/\n{3,}/g, "\n\n");
}

/** Advice key per reason (studio locale "studio2.rv.fix.*"). */
export function adviceKey(c: VerifiedClaim): string {
  const r = c.reasons[0] || "";
  if (r.startsWith("number_")) return "number";
  const known = [
    "skill_not_in_evidence",
    "skill_negated",
    "skill_studied_only",
    "credential_not_in_evidence",
    "credential_attended_only",
    "credential_planned_only",
    "role_inflated",
    "team_vs_individual",
    "attributed_to_other",
    "team_size_as_reports",
    "contribution_unconfirmed",
    "award_not_won",
    "place_mismatch",
    "verifier_unavailable",
  ];
  return known.includes(r) ? r : "default";
}
