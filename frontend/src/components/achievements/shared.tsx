"use client";

import { Award, Briefcase, GraduationCap, Medal, PenLine, Upload } from "lucide-react";
import { GithubIcon } from "@/components/brand-icons";
import type { BadgeTone } from "@/components/ui/card";
import type { TKey } from "@/lib/i18n";
import type { Achievement, Suggestion } from "@/lib/types";

export const CATEGORIES = ["project", "certification", "experience", "award", "education"] as const;
export const SOURCES = ["manual", "upload", "github"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Source = (typeof SOURCES)[number];
export type AchStatus = Achievement["status"];

export const CATEGORY_ICON: Record<Category, React.ElementType> = {
  project: Briefcase,
  certification: Award,
  experience: Briefcase,
  award: Medal,
  education: GraduationCap,
};
export const SOURCE_ICON: Record<Source, React.ElementType> = { manual: PenLine, github: GithubIcon, upload: Upload };

/** Every status suggest_for_achievement (backend app/services/cv_updates.py) can return. */
export type CVUpdateStatus = "created" | "exists" | "duplicate" | "no_changes" | "stale" | "conflict" | "no_cv" | "ai_unavailable";
export type CVUpdate = { status: CVUpdateStatus; suggestion?: Suggestion; reason?: string; rationale?: string };

/** Response of /api/achievements/extract and /api/discovery/upload. */
export type DiscoveryResult = {
  candidates: Achievement[];
  no_achievement_reason: string;
  injection_flags: string[];
  file?: string;
};

export type GithubRepo = {
  full_name: string;
  name: string;
  description: string;
  language: string | null;
  stars: number;
  fork: boolean;
  private: boolean;
  pushed_at: string;
  html_url: string | null;
  owner: string | null;
  scan_state: "new" | "updated" | "unchanged";
  last_scanned_at: string | null;
};

export type ScanResult =
  | { repo: string; status: "error"; message: string }
  | { repo: string; status: "unchanged" }
  | {
      repo: string;
      status: "scanned";
      candidates: Achievement[];
      your_commits: number;
      injection_flags: string[];
      no_achievement_reason: string;
    };

export type IntegrationStatus = {
  configured_on_server: boolean;
  connected: boolean;
  status: string;
  account_name: string | null;
};

/** Simple "{name}" interpolation for dictionary strings. */
export function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** Coarse, honest bucket for the AI's confidence score — never shown as a precise percentage. */
export function confidenceLevel(c: number): "low" | "medium" | "high" {
  if (c >= 0.75) return "high";
  if (c >= 0.45) return "medium";
  return "low";
}

export const STATUS_TONE: Record<AchStatus, BadgeTone> = { pending: "warn", confirmed: "ok", rejected: "neutral" };

export function stateKey(s: AchStatus): TKey {
  return `achievements2.state.${s}` as TKey;
}

/** Quotes that the deterministic verifier found literally in the source. */
export function verifiedQuotes(a: Achievement) {
  return a.evidence.filter((e) => !!e.quote && e.verified !== false);
}

/** GitHub API metadata evidence (repo link, no quote). */
export function repoEvidence(a: Achievement) {
  return a.evidence.find((e) => !e.quote && (e.repo || e.url));
}

/** Human label for where an achievement came from (file name or repo), falling back to the source type. */
export function sourceRef(a: Pick<Achievement, "source_ref">) {
  const ref = a.source_ref || "";
  if (ref.startsWith("upload:")) return ref.replace(/^upload:[^:]+:/, "");
  if (ref.startsWith("github:")) return ref.replace(/^github:/, "");
  return ref;
}

export function matchesQuery(a: Achievement, q: string) {
  if (!q) return true;
  const hay = [a.title, a.description, a.impact, a.contribution_note, sourceRef(a), ...a.technologies, ...a.skills].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function cvUpdateTone(s: CVUpdateStatus): "ok" | "info" | "warn" | "bad" {
  if (s === "created") return "ok";
  if (s === "stale" || s === "conflict") return "warn";
  if (s === "ai_unavailable") return "bad";
  return "info";
}
