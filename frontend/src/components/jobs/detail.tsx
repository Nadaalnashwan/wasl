"use client";

import { Bookmark, ExternalLink, FileText, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CompanyMark, fill, JobMeta, type MatchDetail, ScoreBreakdown, scoreText, SkillGroups, usePosted } from "@/components/jobs";
import { Notice, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, DescriptionList } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Job, JobItem, TrackStatus } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export const STATUSES: TrackStatus[] = ["saved", "applied", "interviewing", "offer", "rejected"];

type ListingDetail = Job & {
  description: string;
  requirements: { must?: string[]; nice?: string[]; min_years?: number | null; education?: string; level?: string; source?: string } | null;
  match?: MatchDetail;
};

export type JobActions = {
  pending?: string | null;
  onSave: (job: JobItem) => void;
  onTrack: (job: JobItem, status: TrackStatus) => void;
  onStatus: (job: JobItem, status: TrackStatus) => void;
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function DetailSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-5">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Description({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const long = text.length > 900;
  return (
    <div>
      <div className={cn("text-sm leading-relaxed whitespace-pre-line text-fg-2", long && !open && "max-h-56 overflow-hidden")} dir="auto">
        {text}
      </div>
      {long && (
        <Button variant="link" size="sm" className="mt-2" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t("jobs2.detail.less") : t("jobs2.detail.more")}
        </Button>
      )}
    </div>
  );
}

export function JobDetail({ item, pending, onSave, onTrack, onStatus, className }: JobActions & { item: JobItem; className?: string }) {
  const { t, locale } = useI18n();
  const posted = usePosted();
  const detail = useApi<ListingDetail>(`/api/jobs/listings/${item.id}`);
  const d = detail.data?.id === item.id ? detail.data : null;
  const match: MatchDetail = (d?.match as MatchDetail | undefined) ?? (item.match as MatchDetail);
  const req = d?.requirements ?? null;
  const status = item.saved?.status;
  const job = item;

  return (
    <article className={cn("min-w-0", className)} aria-labelledby={`job-${item.id}-title`}>
      <header className="flex flex-col gap-4 px-5 pt-5 pb-5">
        <div className="flex items-start gap-3.5">
          <CompanyMark job={job} />
          <div className="min-w-0 flex-1">
            <h2 id={`job-${item.id}-title`} className="text-heading leading-snug font-semibold break-words text-fg" dir="auto">
              {job.title}
            </h2>
            <p className="mt-0.5 text-sm text-fg-2" dir="auto">
              {job.company || "—"}
              {job.publisher && <span className="text-fg-3"> · {fill(t("jobs2.detail.publisher"), { p: job.publisher })}</span>}
            </p>
            <JobMeta job={job} className="mt-2" />
          </div>
          <div className="shrink-0 text-end">
            <div className={cn("num text-2xl leading-none font-semibold", scoreText(match.score))}>{match.score}%</div>
            <div className="mt-1 text-xs text-fg-3">{t("jobs2.match")}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {job.apply_url && (
            <Button asChild>
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink className="rtl:-scale-x-100" />
                {t("jobs.apply")}
                <span className="sr-only">{t("jobs2.detail.newtab")}</span>
              </a>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href={`/tailor?job=${job.id}`}>
              <FileText />
              {t("jobs.tailor")}
            </Link>
          </Button>
          {!status && (
            <Button variant="outline" onClick={() => onSave(item)} loading={pending === `save:${job.id}`}>
              <Bookmark />
              {t("jobs.save")}
            </Button>
          )}
          {status !== "applied" && status !== "interviewing" && status !== "offer" && (
            <Button variant="ghost" onClick={() => onTrack(item, "applied")} loading={pending === `track:${job.id}`}>
              <Send className="rtl:-scale-x-100" />
              {t("jobs.markapplied")}
            </Button>
          )}
        </div>

        {status && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
            <label htmlFor={`status-${job.id}`} className="text-sm text-fg-2">
              {t("jobs2.detail.status")}
            </label>
            <Select
              id={`status-${job.id}`}
              className="h-8 w-auto min-w-36"
              value={status}
              disabled={pending === `status:${job.id}`}
              onChange={(e) => onStatus(item, e.target.value as TrackStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`track.${s}` as TKey)}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => onSave(item)} loading={pending === `save:${job.id}`}>
              <Trash2 />
              {t("jobs2.detail.unsave")}
            </Button>
          </div>
        )}

        {job.apply_options?.length > 1 && (
          <div className="text-sm">
            <span className="text-fg-3">{t("jobs2.detail.other_apply")}: </span>
            {job.apply_options
              .filter((o) => o.link && o.link !== job.apply_url)
              .slice(0, 5)
              .map((o, i) => (
                <span key={o.link}>
                  {i > 0 && <span className="text-fg-3"> · </span>}
                  <a href={o.link} target="_blank" rel="noopener noreferrer nofollow" className="text-primary-text hover:underline" dir="auto">
                    {o.title || hostOf(o.link)}
                  </a>
                </span>
              ))}
          </div>
        )}
      </header>

      <DetailSection title={t("jobs2.detail.match")} description={t("jobs2.detail.match.d")}>
        <ScoreBreakdown match={match} />
      </DetailSection>

      <DetailSection title={t("jobs2.detail.skills")}>
        <SkillGroups match={match} />
      </DetailSection>

      <DetailSection title={t("jobs2.detail.requirements")}>
        <DescriptionList
          items={[
            { label: t("jobs.filter.level"), value: t(`jobs.level.${(req?.level as Job["level"]) || job.level}` as TKey) },
            {
              label: t("jobs2.req.years"),
              value: (req?.min_years ?? job.min_years) != null ? fill(t("jobs2.req.years.v"), { n: (req?.min_years ?? job.min_years) as number }) : t("jobs2.req.notstated"),
            },
            { label: t("jobs2.req.education"), value: (req?.education || job.education) || t("jobs2.req.notstated") },
            { label: t("jobs.filter.type"), value: job.employment_type ? t(`jobs.type.${job.employment_type}` as TKey) : t("jobs2.req.notstated") },
            ...(job.salary ? [{ label: t("jobs2.detail.salary"), value: <span dir="auto">{job.salary}</span> }] : []),
            { label: t("jobs2.detail.location"), value: <span dir="auto">{job.location || job.city || t("jobs.city.Other")}</span> },
            ...(job.posted_at ? [{ label: t("jobs.posted"), value: `${fmtDate(job.posted_at, locale)} · ${posted(job.posted_at)}` }] : []),
            {
              label: t("jobs2.detail.source"),
              value: (
                <span className="flex flex-wrap gap-1.5">
                  {job.publisher && <span dir="auto">{job.publisher}</span>}
                  {job.providers?.map((p) => (
                    <Badge key={p} tone="outline">
                      {p}
                    </Badge>
                  ))}
                </span>
              ),
            },
            {
              label: t("jobs2.req.source"),
              value: t((req?.source || job.requirements_source) === "ai" ? "jobs2.req.source.ai" : "jobs2.req.source.rules"),
            },
          ]}
        />
      </DetailSection>

      <DetailSection title={t("jobs2.detail.description")}>
        {detail.loading && !d ? (
          <SkeletonRows rows={2} />
        ) : d?.description ? (
          <Description text={d.description} />
        ) : detail.error ? (
          <Notice tone="warn">{t("jobs2.detail.loadfail")}</Notice>
        ) : (
          <p className="text-sm text-fg-3">{t("jobs2.req.notstated")}</p>
        )}
      </DetailSection>
    </article>
  );
}
