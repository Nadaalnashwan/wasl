"use client";

import { Bookmark, BookmarkCheck, Briefcase, Building2, CheckCircle2, ExternalLink, MapPin, Scissors, Send, Sparkles, Wifi, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Job, JobItem, JobMatch, JobScorePart, TrackStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "{n} of {t}" style placeholders for i18n strings. */
export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function scoreTone(score: number) {
  return score >= 70 ? "var(--ok)" : score >= 45 ? "var(--warn)" : "var(--bad)";
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

/** Hand-drawn ring with the match percentage. */
export function MatchRing({ score, size = 72, label }: { score: number; size?: number; label?: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <figure className="flex shrink-0 flex-col items-center" aria-label={`${score}% ${label ?? ""}`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <g filter="url(#rough)" fill="none">
          <circle cx="32" cy="32" r={r} stroke="var(--paper-3)" strokeWidth="7" />
          <circle cx="32" cy="32" r={r} stroke={scoreTone(score)} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 32 32)" />
          <circle cx="32" cy="32" r={r + 4.5} stroke="var(--ink)" strokeWidth="2" />
          <circle cx="32" cy="32" r={r - 4.5} stroke="var(--ink)" strokeWidth="1.5" />
        </g>
        <text x="32" y="37" textAnchor="middle" fontSize="16" fill="var(--ink)" style={{ fontFamily: "var(--font-hand)" }}>
          {score}%
        </text>
      </svg>
      {label && <figcaption className="-mt-0.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{label}</figcaption>}
    </figure>
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

/** Every component of the score, its weight and the plain-language reason. */
export function ScoreBreakdown({ match }: { match: JobMatch }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      {match.breakdown.map((p) => (
        <div key={p.key}>
          <div className="flex items-baseline gap-2 text-sm">
            <b>{t(`jobs.part.${p.key}` as TKey)}</b>
            <span className="text-xs text-ink-faint">×{Math.round(p.weight * 100)}%</span>
            <span className="ms-auto font-hand text-lg">{p.score}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full border-2 border-ink bg-paper-3">
            <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: scoreTone(p.score) }} />
          </div>
          <p className="mt-1 text-xs text-ink-soft">{partText(p, t)}</p>
        </div>
      ))}
      <p className="text-xs text-ink-soft">
        = {match.breakdown.map((p) => `${p.score}×${Math.round(p.weight * 100)}%`).join(" + ")} → <b>{match.score}%</b>
      </p>
      {match.confidence === "low" && <p className="text-xs text-warn">{t("jobs.confidence.low")}</p>}
    </div>
  );
}

function CompanyMark({ job }: { job: Job }) {
  const [broken, setBroken] = useState(false);
  const initials = (job.company || job.title).split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (job.company_logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote logos from many hosts; next/image would need each domain configured
      <img src={job.company_logo} alt="" onError={() => setBroken(true)} className="size-12 shrink-0 rounded-xl border-2 border-ink bg-white object-contain p-1" />
    );
  }
  return <div className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-ink bg-sky font-hand text-xl">{initials || <Building2 />}</div>;
}

export function JobMeta({ job }: { job: Job }) {
  const { t } = useI18n();
  const posted = usePosted();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 text-ink-soft">
        <MapPin className="size-3.5" />
        {job.city || t("jobs.city.Other")}
      </span>
      {job.is_remote && (
        <Badge tone="sky">
          <Wifi /> {t("jobs.remote.remote")}
        </Badge>
      )}
      {job.employment_type && <Badge>{t(`jobs.type.${job.employment_type}` as TKey)}</Badge>}
      {job.level !== "unknown" && job.level !== job.employment_type && <Badge>{t(`jobs.level.${job.level}` as TKey)}</Badge>}
      {job.posted_at && <span className="text-ink-faint">· {posted(job.posted_at)}</span>}
    </div>
  );
}

export function SkillChips({ match, limit = 6 }: { match: JobMatch; limit?: number }) {
  const { t } = useI18n();
  if (!match.matching_skills.length && !match.missing_skills.length) return null;
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {match.matching_skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-ok">
            <CheckCircle2 className="me-1 inline size-3.5" />
            {t("jobs.matching")}
          </span>
          {match.matching_skills.slice(0, limit).map((s) => (
            <Badge key={s} tone="ok">{s}</Badge>
          ))}
        </div>
      )}
      {match.missing_skills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-bad">
            <XCircle className="me-1 inline size-3.5" />
            {t("jobs.missing")}
          </span>
          {match.missing_skills.slice(0, limit).map((s) => (
            <Badge key={s} tone="bad">{s}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function JobCard({
  job,
  pending,
  onSave,
  onTrack,
}: {
  job: JobItem;
  pending?: string | null;
  onSave: (job: JobItem) => void;
  onTrack: (job: JobItem, status: TrackStatus) => void;
}) {
  const { t } = useI18n();
  const status = job.saved?.status;
  return (
    <article className="sketch pop-in flex flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <CompanyMark job={job} />
        <div className="min-w-0 flex-1">
          <h3 className="font-hand text-2xl leading-tight break-words" dir="auto">
            {job.title}
          </h3>
          <div className="mt-0.5 text-sm text-ink-soft" dir="auto">
            <b className="text-ink">{job.company || "—"}</b>
            {job.publisher && (
              <span className="text-ink-faint">
                {" "}· {t("jobs.via")} {job.publisher}
              </span>
            )}
          </div>
          <div className="mt-2">
            <JobMeta job={job} />
          </div>
        </div>
        <MatchRing score={job.match.score} label={t("jobs.match")} />
      </div>

      <SkillChips match={job.match} />

      <details className="sketch-soft bg-paper-2 px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-2 font-hand text-lg">
          {t("jobs.why")}
          {job.requirements_source === "ai" && (
            <Badge tone="sky" className="ms-auto">
              <Sparkles /> {t("jobs.ai")}
            </Badge>
          )}
        </summary>
        <div className="mt-3">
          <ScoreBreakdown match={job.match} />
          {job.salary && <p className="mt-3 text-xs text-ink-soft">💰 {job.salary}</p>}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        {job.apply_url && (
          <Button asChild size="sm">
            <a href={job.apply_url} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink /> {t("jobs.apply")}
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="secondary">
          <Link href={`/tailor?job=${job.id}`}>
            <Scissors /> {t("jobs.tailor")}
          </Link>
        </Button>
        <Button size="sm" variant={status ? "success" : "outline"} onClick={() => onSave(job)} loading={pending === `save:${job.id}`}
          aria-pressed={!!status}>
          {status ? <BookmarkCheck /> : <Bookmark />}
          {status ? t(`track.${status}` as TKey) : t("jobs.save")}
        </Button>
        {status !== "applied" && status !== "interviewing" && status !== "offer" && (
          <Button size="sm" variant="ghost" onClick={() => onTrack(job, "applied")} loading={pending === `track:${job.id}`}>
            <Send className="rtl:rotate-180" /> {t("jobs.markapplied")}
          </Button>
        )}
      </div>
    </article>
  );
}

/** Small list used on the dashboard. */
export function JobsPreview({ items }: { items: JobItem[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((j) => (
        <li key={j.id}>
          <Link href="/jobs" className="sketch-soft flex items-center gap-3 bg-paper p-3 transition-transform hover:-translate-y-0.5">
            <Briefcase className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm">
              <b className="block truncate" dir="auto">{j.title}</b>
              <span className="block truncate text-xs text-ink-soft" dir="auto">
                {j.company} · {j.city || t("jobs.city.Other")}
              </span>
            </span>
            <span className={cn("font-hand text-2xl")} style={{ color: scoreTone(j.match.score) }}>
              {j.match.score}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
