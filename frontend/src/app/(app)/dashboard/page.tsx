
"use client";

import { useState } from "react";
import {
  ArrowRight,
  Award,
  Briefcase,
  FileText,
  PenLine,
  Scissors,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { LinkedinIcon as Linkedin } from "@/components/brand-icons";
import Link from "next/link";
import {
  EmptyState,
  ErrorNote,
  Loading,
} from "@/components/feedback";
import { JobsPreview } from "@/components/jobs";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, Stat } from "@/components/ui/card";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";
import type { JobsResponse } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type Summary = {
  achievements: {
    confirmed: number;
    pending: number;
    rejected: number;
  };
  posts: {
    draft: number;
    published: number;
    failed: number;
  };
  cv: {
    exists: boolean;
    version: number | null;
    updated_at: string | null;
    pending_suggestions: number;
    sections: Record<string, number> | null;
  };
  recent_activity: {
    id: string;
    type: "achievement" | "linkedin_post";
    title: string;
    preview: string;
    created_at: string;
  }[];
  integrations: Record<string, string>;
  last_analysis: {
    id: string;
    kind: string;
    job_title: string;
    match_score: number | null;
    created_at: string;
  } | null;
  recommendations: {
    key: string;
    count?: number;
    action: string;
    priority: string;
    available?: boolean;
  }[];
};

type RecentActivity = Summary["recent_activity"][number];

function ActivityItem({ activity }: { activity: RecentActivity }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isAchievement = activity.type === "achievement";
  const ActivityIcon = isAchievement ? Award : Linkedin;
  const contentId = `activity-content-${activity.type}-${activity.id}`;

  return (
    <article className="sketch-soft flex min-w-0 max-w-full items-start gap-2.5 overflow-hidden bg-paper p-3 sm:gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border-2 border-ink bg-sky">
        <ActivityIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="text-xs font-semibold text-ink-soft">
            {t(isAchievement ? "dash.activity.achievement" : "dash.activity.linkedin_post")}
          </p>
          <time className="text-xs text-ink-faint" dateTime={activity.created_at}>
            {fmtDate(activity.created_at, locale)}
          </time>
        </div>
        {isAchievement && (
          <p className="mt-1 max-w-full break-words text-sm font-semibold [overflow-wrap:anywhere]" dir="auto">
            {activity.title}
          </p>
        )}
        <p
          id={contentId}
          className={`mt-1 max-w-full break-words whitespace-pre-wrap text-sm text-ink-soft [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-3"}`}
          dir="auto"
        >
          {activity.preview}
        </p>
        {!isAchievement && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 w-fit cursor-pointer rounded-sm text-xs font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t(expanded ? "dash.activity.show_less" : "dash.activity.view_post")}
          </button>
        )}
      </div>
    </article>
  );
}

const REC_ICON: Record<string, React.ElementType> = {
  create_cv: FileText,
  review_suggestions: FileText,
  achievements_not_in_cv: FileText,
  achievements_not_posted: PenLine,
  connect_linkedin: Linkedin,
  try_gap: Target,
};

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } =
    useApi<Summary>("/api/dashboard");
  // reads the already-scored feed; never spends job-API quota
  const jobs = useApi<JobsResponse>("/api/jobs/recommendations?limit=3");

  const recommendations =
    data?.recommendations.filter(
      (r) =>
        r.key !== "review_pending" &&
        r.key !== "connect_github" &&
        !r.action.startsWith("/discovery")
    ) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-hand text-4xl md:text-5xl">
          {t("dash.hello")},{" "}
          <span className="marker">
            {user?.full_name?.split(" ")[0] ||
              user?.email.split("@")[0]}
          </span>
        </h1>

        <p className="mt-3 text-ink-soft">
          {t("dash.sub")}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/studio">
              <PenLine /> {t("nav.studio")}
            </Link>
          </Button>

          <Button asChild variant="outline">
            <Link href="/jobs">
              <Briefcase /> {t("nav.jobs")}
            </Link>
          </Button>

          <Button asChild variant="outline">
            <Link href="/tailor">
              <Scissors /> {t("nav.tailor")}
            </Link>
          </Button>
        </div>
      </div>

      <ErrorNote error={error} onRetry={reload} />

      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              icon={<Award />}
              label={t("dash.achievements")}
              value={data.achievements.confirmed}
              tone="sky"
            />

            <Stat
              icon={<Search />}
              label={t("dash.pending")}
              value={data.achievements.pending}
              hint={
                data.cv.pending_suggestions
                  ? `+ ${data.cv.pending_suggestions} CV drafts`
                  : undefined
              }
            />

            <Stat
              icon={<Linkedin />}
              label={t("dash.posts")}
              value={data.posts.published}
              hint={`${data.posts.draft} ${t(
                "post.status.draft"
              ).toLowerCase()}`}
            />

            <Stat
              icon={<FileText />}
              label={t("dash.cv")}
              value={
                data.cv.exists
                  ? `v${data.cv.version}`
                  : "—"
              }
              hint={
                data.cv.exists
                  ? fmtDate(data.cv.updated_at, locale)
                  : t("dash.cv.none")
              }
            />
          </div>

          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="min-w-0 max-w-full">
              <CardTitle icon={<Sparkles />}>
                {t("dash.recent")}
              </CardTitle>

              {data.recent_activity.length === 0 ? (
                <EmptyState title={t("dash.activity.empty")} />
              ) : (
                <div className="flex min-w-0 max-w-full flex-col gap-2">
                  {data.recent_activity.map((activity) => (
                    <ActivityItem key={`${activity.type}:${activity.id}`} activity={activity} />
                  ))}
                </div>
              )}
            </Card>

            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardTitle
                  icon={<Briefcase />}
                  action={
                    jobs.data?.items.length ? (
                      <Link href="/jobs" className="text-sm font-semibold underline">
                        {t("dash.jobs.all")}
                      </Link>
                    ) : undefined
                  }
                >
                  {t("dash.jobs")}
                </CardTitle>

                {jobs.data?.items.length ? (
                  <JobsPreview items={jobs.data.items} />
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-ink-soft">
                      {jobs.data?.state === "no_cv" ? t("jobs.nocv.d") : t("dash.jobs.empty")}
                    </p>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={jobs.data?.state === "no_cv" ? "/cv" : "/jobs"}>
                        <Briefcase /> {jobs.data?.state === "no_cv" ? t("nav.cv") : t("jobs.refresh")}
                      </Link>
                    </Button>
                  </div>
                )}
              </Card>

              <Card tone="sky">
                <CardTitle icon={<Target />}>
                  {t("dash.recs")}
                </CardTitle>

                {recommendations.length === 0 ? (
                  <p className="text-sm text-ink-soft">
                    {locale === "ar"
                      ? "كل شيء محدّث 🎉"
                      : "Everything is up to date 🎉"}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {recommendations.map((r) => {
                      const Icon =
                        REC_ICON[r.key] ?? Sparkles;

                      return (
                        <li key={r.key}>
                          <Link
                            href={r.action}
                            className="sketch-soft flex items-center gap-3 bg-paper p-3 transition-transform hover:-translate-y-0.5"
                          >
                            <Icon className="size-5 shrink-0" />

                            <span className="flex-1 text-sm">
                              {r.count ? (
                                <b>{r.count} </b>
                              ) : null}

                              {t(
                                `rec.${r.key}` as TKey
                              )}

                              {r.available === false && (
                                <Badge className="ms-2">
                                  {t(
                                    "common.notconfigured"
                                  )}
                                </Badge>
                              )}
                            </span>

                            <Badge
                              tone={
                                r.priority === "high"
                                  ? "warn"
                                  : "neutral"
                              }
                            >
                              {t(
                                `prio.${r.priority}` as TKey
                              )}
                            </Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardTitle icon={<FileText />}>
                  {t("dash.cv")}
                </CardTitle>

                {data.cv.exists &&
                data.cv.sections ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(
                      data.cv.sections
                    ).map(([k, v]) => (
                      <Badge key={k} tone="sky">
                        {t(
                          `cv.section.${k}` as TKey
                        )}
                        : {v}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft">
                    {t("cv.empty")}
                  </p>
                )}

                {data.last_analysis && (
                  <Link
                    href={
                      data.last_analysis.kind === "gap"
                        ? "/gap"
                        : "/tailor"
                    }
                    className="mt-4 flex items-center gap-3 rounded-xl bg-paper-2 p-3 text-sm"
                  >
                    <Target className="size-5" />

                    <span className="flex-1">
                      {data.last_analysis.job_title ||
                        "—"}{" "}
                      ·{" "}
                      {fmtDate(
                        data.last_analysis.created_at,
                        locale
                      )}
                    </span>

                    <span className="font-hand text-2xl">
                      {data.last_analysis.match_score ??
                        "—"}
                      %
                    </span>
                  </Link>
                )}

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-4"
                >
                  <Link href="/cv">
                    {t("nav.cv")}{" "}
                    <ArrowRight className="rtl:rotate-180" />
                  </Link>
                </Button>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
