"use client";

import { Building2, MapPin, Wifi } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/card";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Job, JobItem, JobMatch, JobScorePart } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "{n} of {t}" style placeholders for i18n strings. */
export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** CSS colour for a 0–100 score (tokens only). */
export function scoreTone(score: number) {
  return score >= 70 ? "var(--ok)" : score >= 45 ? "var(--warn)" : "var(--bad)";
}

/** Tailwind text class for a 0–100 score. */
export function scoreText(score: number) {
  return score >= 70 ? "text-ok" : score >= 45 ? "text-warn" : "text-bad";
}

export function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function usePosted() {
  const { t } = useI18n();
  return (iso: string | null) => {
    const d = daysSince(iso);
    if (d === null) return "";
    return d === 0 ? t("jobs.today") : fill(t("jobs.daysago"), { d });
  };
}

/** Per-skill evidence status returned by the matcher (present on /recommendations and /listings/{id}). */
export type SkillEvidence = { skill: string; status: "verified" | "unverified" | "missing"; sources: string[] };
export type MatchDetail = JobMatch & { must?: SkillEvidence[]; nice?: SkillEvidence[] };

/** Compact score: number + thin bar. Real API value only. */
export function ScoreMeter({ score, className, label }: { score: number; className?: string; label?: string }) {
  return (
    <div className={cn("flex w-12 shrink-0 flex-col items-end gap-1", className)} aria-label={label ? `${label}: ${score}%` : `${score}%`}>
      <span className={cn("num text-sm font-semibold", scoreText(score))} aria-hidden>
        {score}%
      </span>
      <span className="block h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${score}%`, background: scoreTone(score) }} />
      </span>
    </div>
  );
}

function partText(p: JobScorePart, t: (k: TKey) => string) {
  switch (p.key) {
    case "skills":
      return fill(t("jobs.part.skills.d"), { m: p.matched, t: p.total });
    case "experience":
      return fill(t("jobs.part.experience.d"), {
        j: t(`jobs.level.${p.job_level}` as TKey),
        u: t(`jobs.level.${p.user_level}` as TKey),
        y: p.user_years,
        r: p.min_years ? fill(t("jobs.part.experience.req"), { n: p.min_years }) : "",
      });
    case "title":
      return p.target ? fill(t("jobs.part.title.d"), { t: p.target }) : t("jobs.part.title.none");
    case "freshness":
      return p.days === null ? t("jobs.part.freshness.none") : fill(t("jobs.part.freshness.d"), { d: p.days });
  }
}

/** Every component of the score, its weight and the plain-language reason from the API. */
export function ScoreBreakdown({ match }: { match: JobMatch }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3.5">
        {match.breakdown.map((p) => (
          <li key={p.key}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium text-fg">{t(`jobs.part.${p.key}` as TKey)}</span>
              <span className="num text-xs text-fg-3">×{Math.round(p.weight * 100)}%</span>
              <span className={cn("num ms-auto font-semibold", scoreText(p.score))}>{p.score}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: scoreTone(p.score) }} />
            </div>
            <p className="mt-1 text-xs text-fg-3">{partText(p, t)}</p>
          </li>
        ))}
      </ul>
      <p className="num border-t border-border pt-3 text-xs text-fg-3" dir="ltr">
        {match.breakdown.map((p) => `${p.score}×${Math.round(p.weight * 100)}%`).join(" + ")} ={" "}
        <b className="text-fg">{match.score}%</b>
      </p>
      {match.confidence === "low" && <p className="text-xs text-warn">{t("jobs.confidence.low")}</p>}
    </div>
  );
}

/** Verified / listed-only / missing skills. Uses per-skill statuses when the API provides them. */
export function SkillGroups({ match }: { match: MatchDetail }) {
  const { t } = useI18n();
  const all = [...(match.must ?? []), ...(match.nice ?? [])];
  const hasDetail = all.length > 0;
  const verified = hasDetail ? all.filter((s) => s.status === "verified") : [];
  const listed = hasDetail ? all.filter((s) => s.status === "unverified") : [];
  const groups: { key: TKey; tone: "ok" | "neutral" | "bad" | "outline"; items: { skill: string; title?: string }[] }[] = hasDetail
    ? [
        { key: "jobs2.skills.verified", tone: "ok", items: verified.map((s) => ({ skill: s.skill, title: s.sources.join(", ") })) },
        { key: "jobs2.skills.listed", tone: "neutral", items: listed.map((s) => ({ skill: s.skill, title: s.sources.join(", ") })) },
        { key: "jobs2.skills.missing", tone: "bad", items: (match.must ?? []).filter((s) => s.status === "missing").map((s) => ({ skill: s.skill })) },
        { key: "jobs2.skills.missing_nice", tone: "outline", items: (match.nice ?? []).filter((s) => s.status === "missing").map((s) => ({ skill: s.skill })) },
      ]
    : [
        { key: "jobs.matching", tone: "ok", items: match.matching_skills.map((s) => ({ skill: s })) },
        { key: "jobs2.skills.missing", tone: "bad", items: match.missing_skills.map((s) => ({ skill: s })) },
        { key: "jobs2.skills.missing_nice", tone: "outline", items: match.missing_nice.map((s) => ({ skill: s })) },
      ];
  const shown = groups.filter((g) => g.items.length);
  if (!shown.length) return <p className="text-sm text-fg-3">{t("jobs2.skills.none")}</p>;
  return (
    <div className="flex flex-col gap-3.5">
      <dl className="flex flex-col gap-3.5">
        {shown.map((g) => (
          <div key={g.key}>
            <dt className="mb-1.5 text-xs font-medium text-fg-2">
              {t(g.key)} <span className="num text-fg-3">· {g.items.length}</span>
            </dt>
            <dd>
              <ul className="flex flex-wrap gap-1.5">
                {g.items.map((s) => (
                  <li key={s.skill}>
                    <Badge tone={g.tone} title={s.title || undefined}>
                      {s.skill}
                    </Badge>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      {hasDetail && <p className="text-xs text-fg-3">{t("jobs2.skills.legend")}</p>}
    </div>
  );
}

export function CompanyMark({ job, size = "md" }: { job: Job; size?: "sm" | "md" }) {
  const [broken, setBroken] = useState(false);
  const initials = (job.company || job.title)
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const box = size === "sm" ? "size-9 text-xs" : "size-12 text-sm";
  if (job.company_logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote logos from many hosts; next/image would need each domain configured
      <img src={job.company_logo} alt="" onError={() => setBroken(true)} className={cn(box, "shrink-0 rounded-lg border border-border bg-white object-contain p-1")} />
    );
  }
  return (
    <div className={cn(box, "grid shrink-0 place-items-center rounded-lg border border-border bg-surface-2 font-semibold text-fg-2")} aria-hidden>
      {initials || <Building2 className="size-4" />}
    </div>
  );
}

export function JobMeta({ job, className }: { job: Job; className?: string }) {
  const { t } = useI18n();
  const posted = usePosted();
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-fg-3", className)}>
      <span className="inline-flex items-center gap-1">
        <MapPin className="size-3.5" aria-hidden />
        {job.city || t("jobs.city.Other")}
      </span>
      {job.is_remote && (
        <span className="inline-flex items-center gap-1 text-fg-2">
          <Wifi className="size-3.5" aria-hidden /> {t("jobs.remote.remote")}
        </span>
      )}
      {job.employment_type && <span>{t(`jobs.type.${job.employment_type}` as TKey)}</span>}
      {job.level !== "unknown" && job.level !== job.employment_type && <span>{t(`jobs.level.${job.level}` as TKey)}</span>}
      {job.posted_at && <span>· {posted(job.posted_at)}</span>}
    </div>
  );
}

/** Small list used on the dashboard. */
export function JobsPreview({ items }: { items: JobItem[] }) {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-border">
      {items.map((j) => (
        <li key={j.id}>
          <Link href="/jobs" className="flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-surface-2">
            <CompanyMark job={j} size="sm" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-medium text-fg" dir="auto">
                {j.title}
              </span>
              <span className="block truncate text-xs text-fg-3" dir="auto">
                {j.company} · {j.city || t("jobs.city.Other")}
              </span>
            </span>
            <span className={cn("num text-sm font-semibold", scoreText(j.match.score))}>{j.match.score}%</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
