"use client";

import { ArrowRight, Award, Briefcase, CheckCircle2, ChevronRight, FileText, PenLine, Plus, Scissors, Search, Sparkles, Target } from "lucide-react";
import { LinkedinIcon } from "@/components/brand-icons";
import Link from "next/link";
import { useState } from "react";
import { AddAchievementDialog } from "@/components/achievements";
import { fmt } from "@/components/achievements/shared";
import { ClaimSummary } from "@/components/claims";
import { EmptyState, ErrorNote, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, StatCard, Status, type BadgeTone } from "@/components/ui/card";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";
import type { Achievement, JobsResponse, Post } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

/** Shape of GET /api/dashboard (backend app/routers/dashboard.py). */
type Summary = {
  user: { full_name: string; headline: string };
  achievements: { confirmed: number; pending: number; rejected: number };
  posts: { draft: number; published: number; failed: number };
  cv: {
    exists: boolean;
    version: number | null;
    updated_at: string | null;
    pending_suggestions: number;
    sections: Record<string, number> | null;
  };
  recent_activity: { id: string; type: "achievement" | "linkedin_post"; title: string; preview: string; created_at: string }[];
  integrations: Record<string, string>;
  last_analysis: { id: string; kind: string; job_title: string; match_score: number | null; created_at: string } | null;
  recommendations: { key: string; count?: number; action: string; priority: string; available?: boolean }[];
};

type Priority = "high" | "medium" | "low";
type AttentionItem = { id: string; href: string; text: string; detail?: React.ReactNode; priority: Priority; note?: string };

const PRIO_TONE: Record<Priority, BadgeTone> = { high: "warn", medium: "brand", low: "neutral" };
const PRIO_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Rule-based recommendations from the API that the dashboard knows how to phrase; anything else is ignored. */
const REC_KEYS: Record<string, TKey> = {
  create_cv: "dashboard2.attention.create_cv",
  review_suggestions: "dashboard2.attention.suggestions",
  achievements_not_in_cv: "dashboard2.attention.not_in_cv",
  achievements_not_posted: "dashboard2.attention.not_posted",
  connect_linkedin: "dashboard2.attention.connect_linkedin",
  try_gap: "dashboard2.attention.try_gap",
};

function useAttention(data: Summary | null, pending: Achievement[] | null): AttentionItem[] {
  const { t } = useI18n();
  if (!data) return [];
  const items: AttentionItem[] = [];

  if (data.achievements.pending > 0) {
    const titles = (pending ?? []).slice(0, 3).map((a) => a.title);
    const more = data.achievements.pending - titles.length;
    items.push({
      id: "pending",
      href: "/achievements?status=pending",
      priority: "high",
      text: fmt(t("dashboard2.attention.pending"), { n: data.achievements.pending }),
      detail: titles.length ? (
        <>
          {titles.join(" · ")}
          {more > 0 && ` ${fmt(t("dashboard2.attention.pending.more"), { n: more })}`}
        </>
      ) : undefined,
    });
  }

  for (const r of data.recommendations) {
    const key = REC_KEYS[r.key];
    if (!key) continue;
    const prio: Priority = r.priority === "high" || r.priority === "medium" ? r.priority : "low";
    items.push({
      id: r.key,
      href: r.action.startsWith("/") ? r.action : "/dashboard",
      priority: prio,
      text: fmt(t(key), { n: r.count ?? 0 }),
      detail: r.key === "create_cv" ? t("dashboard2.attention.create_cv.d") : undefined,
      note: r.available === false ? t("dashboard2.attention.unavailable") : undefined,
    });
  }

  if (data.posts.failed > 0) {
    items.push({
      id: "failed_posts",
      href: "/studio",
      priority: "medium",
      text: fmt(t("dashboard2.attention.failed_posts"), { n: data.posts.failed }),
    });
  }

  return items.sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]);
}

const PRIO_ICON: Record<string, React.ElementType> = {
  pending: Award,
  create_cv: FileText,
  review_suggestions: FileText,
  achievements_not_in_cv: FileText,
  achievements_not_posted: PenLine,
  connect_linkedin: LinkedinIcon,
  try_gap: Target,
  failed_posts: PenLine,
};

/** v1 "Next best steps": outlined rows with an icon, the step, and a priority pill. */
function NextSteps({ items }: { items: AttentionItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <p className="ink-soft flex items-center gap-2.5 px-4 py-3.5 text-sm text-fg">
        <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden /> {t("dashboard2.attention.none")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => {
        const Icon = PRIO_ICON[it.id] ?? ChevronRight;
        return (
          <li key={it.id}>
            <Link
              href={it.href}
              className="ink-soft group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Icon className="mt-0.5 size-[18px] shrink-0 text-fg-2" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{it.text}</span>
                {it.detail && <span className="mt-0.5 line-clamp-2 block text-xs text-fg-3">{it.detail}</span>}
                {it.note && (
                  <Badge tone="outline" className="mt-1.5">
                    {it.note}
                  </Badge>
                )}
              </span>
              <Badge tone={PRIO_TONE[it.priority]} className="shrink-0">
                {t(`dashboard2.prio.${it.priority}` as TKey)}
              </Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<Summary>("/api/dashboard");
  const pending = useApi<Achievement[]>(data && data.achievements.pending > 0 ? "/api/achievements?status=pending" : null);
  const posts = useApi<Post[]>(data && data.posts.draft > 0 ? "/api/posts" : null);
  // reads the already-scored feed; never spends job-API quota
  const jobs = useApi<JobsResponse>("/api/jobs/recommendations?limit=3");
  const attention = useAttention(data, pending.data);

  const name = (data?.user.full_name || user?.full_name || "").split(" ")[0] || user?.email.split("@")[0] || "";
  const drafts = (posts.data ?? []).filter((p) => p.status === "draft").slice(0, 2);

  function refreshAll() {
    reload();
    pending.reload();
  }

  return (
    <div className="flex flex-col gap-8">
      {/* v1: greeting with the name marked, the line under it, and the quick actions */}
      <header>
        <h1 className="font-display text-[2.3rem] leading-[1.15] text-fg sm:text-[2.8rem] rtl:leading-snug">
          {t("dash.hello")}
          {name && (
            <>
              {locale === "ar" ? "، " : ", "}
              <span className="highlight">
                <bdi>{name}</bdi>
              </span>
            </>
          )}
        </h1>
        <p className="mt-2 text-[15px] text-fg-2">{t("dash.sub")}</p>
        <nav aria-label={t("dash.quick")} className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild variant="subtle">
            <Link href="/studio">
              <PenLine /> {t("nav.studio")}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/jobs">
              <Briefcase /> {t("nav.jobs")}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/tailor">
              <Scissors /> {t("nav.tailor")}
            </Link>
          </Button>
          <AddAchievementDialog
            onDone={refreshAll}
            trigger={
              <Button variant="secondary">
                <Plus /> {t("dashboard2.ach.add")}
              </Button>
            }
          />
        </nav>
      </header>

      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <SkeletonRows rows={3} />}

      {data && (
        <>
          {/* v1: four stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard tone="sky" icon={<Award />} label={t("dash.achievements")} value={data.achievements.confirmed} href="/achievements?status=confirmed" />
            <StatCard
              icon={<Search />}
              label={t("dash.pending")}
              value={data.achievements.pending}
              href="/achievements?status=pending"
              hint={data.achievements.rejected ? fmt(t("dashboard2.stat.rejected"), { n: data.achievements.rejected }) : undefined}
            />
            <StatCard
              icon={<LinkedinIcon className="size-4" />}
              label={t("dash.posts")}
              value={data.posts.published}
              href="/studio"
              hint={
                [
                  data.posts.draft ? fmt(t("dashboard2.stat.drafts"), { n: data.posts.draft }) : null,
                  data.posts.failed ? fmt(t("dashboard2.stat.failed"), { n: data.posts.failed }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
            <StatCard
              icon={<FileText />}
              label={t("dash.cv")}
              value={data.cv.exists ? `v${data.cv.version ?? 1}` : "—"}
              href="/cv"
              hint={data.cv.exists ? fmtDate(data.cv.updated_at, locale) : t("dash.cv.none")}
            />
          </div>

          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* ------------------------------------------------ v1 left column: recent activity */}
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardTitle
                  icon={<Sparkles />}
                  action={
                    <Link href="/achievements" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">
                      {t("dashboard2.ach.all")} <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                    </Link>
                  }
                >
                  {t("dash.recent")}
                </CardTitle>
                {data.recent_activity.length === 0 ? (
                  <EmptyState compact title={t("dash.activity.empty")} text={t("dashboard2.ach.empty.d")} />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {data.recent_activity.map((a) => (
                      <ActivityItem key={`${a.type}-${a.id}`} item={a} />
                    ))}
                  </ul>
                )}
              </Card>

              {data.posts.draft + data.posts.published + data.posts.failed > 0 && (
                <Card>
                  <CardTitle
                    icon={<PenLine />}
                    action={
                      <Link href="/studio" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline">
                        {t("dashboard2.content.open")} <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
                      </Link>
                    }
                  >
                    {t("dash.posts")}
                  </CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="outline">
                      {t("dashboard2.content.drafts")}: <span className="num">{data.posts.draft}</span>
                    </Badge>
                    <Badge tone="outline">
                      {t("dashboard2.content.published")}: <span className="num">{data.posts.published}</span>
                    </Badge>
                    {data.posts.failed > 0 && (
                      <Badge tone="bad">
                        {t("dashboard2.content.failed")}: <span className="num">{data.posts.failed}</span>
                      </Badge>
                    )}
                  </div>
                  {drafts.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-3">
                      {drafts.map((p) => (
                        <li key={p.id}>
                          <Link href="/studio" className="ink-soft group block px-4 py-3 hover:bg-surface-2">
                            <span className="line-clamp-2 text-sm text-fg" dir="auto">
                              {p.content}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-fg-3">
                              <span>{fmtDate(p.updated_at, locale)}</span>
                              <ClaimSummary report={p.claim_check} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </div>

            {/* ------------------------------------------------ v1 right column */}
            <aside className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardTitle icon={<Briefcase />}>{t("dash.jobs")}</CardTitle>
                {jobs.data?.items.length ? (
                  <>
                    <ul className="flex flex-col gap-2.5">
                      {jobs.data.items.map((j) => (
                        <li key={j.id}>
                          <Link href="/jobs" className="ink-soft group flex items-center gap-3 px-3.5 py-3 hover:bg-surface-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-fg" dir="auto">
                                {j.title}
                              </span>
                              <span className="block truncate text-xs text-fg-3" dir="auto">
                                {[j.company, j.city || j.location].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="num font-display shrink-0 text-lg text-fg">{Math.round(j.match.score)}%</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant="secondary" size="sm" className="mt-4">
                      <Link href="/jobs">
                        {t("dash.jobs.all")} <ArrowRight className="rtl:rotate-180" />
                      </Link>
                    </Button>
                  </>
                ) : jobs.loading && !jobs.data ? (
                  <SkeletonRows rows={1} />
                ) : (
                  <>
                    <p className="text-sm text-fg-2">{jobs.data?.state === "no_cv" ? t("jobs.nocv.d") : t("dash.jobs.empty")}</p>
                    <Button asChild size="sm" variant="secondary" className="mt-4">
                      <Link href={jobs.data?.state === "no_cv" ? "/cv" : "/jobs"}>
                        <Briefcase /> {jobs.data?.state === "no_cv" ? t("nav.cv") : t("jobs.refresh")}
                      </Link>
                    </Button>
                  </>
                )}
              </Card>

              <Card tone="sky">
                <CardTitle icon={<Target />}>{t("dash.recs")}</CardTitle>
                <div aria-live="polite">
                  <NextSteps items={attention} />
                </div>
              </Card>

              <Card>
                <CardTitle icon={<FileText />}>{t("dash.cv")}</CardTitle>
                {data.cv.exists ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-fg-2">
                      <span className="font-semibold text-fg">{fmt(t("dashboard2.cv.version"), { v: data.cv.version ?? "—" })}</span> ·{" "}
                      {fmtDate(data.cv.updated_at, locale)}
                    </p>
                    {data.cv.sections && (
                      <ul className="flex flex-wrap gap-2" aria-label={t("dashboard2.cv.sections")}>
                        {Object.entries(data.cv.sections).map(([k, v]) => (
                          <li key={k}>
                            <Badge tone={v ? "brand" : "outline"}>
                              {t(`cv.section.${k}` as TKey)}: <span className="num">{v}</span>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                    {data.cv.pending_suggestions > 0 && (
                      <Link href="/cv" className="inline-flex items-center gap-2 text-sm font-semibold text-warn hover:underline">
                        <Status tone="warn">
                          <span className="sr-only">{t("dashboard2.prio.high")}</span>
                        </Status>
                        {fmt(t("dashboard2.cv.drafts"), { n: data.cv.pending_suggestions })}
                      </Link>
                    )}
                    {data.last_analysis && (
                      <Link
                        href={data.last_analysis.kind === "gap" ? "/gap" : "/tailor"}
                        className="group flex items-center gap-3 rounded-[11px] bg-surface-2 px-3.5 py-3 text-sm hover:bg-primary-soft"
                      >
                        <Target className="size-[18px] shrink-0 text-fg-2" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-fg" dir="auto">
                            {data.last_analysis.job_title || t("dashboard2.cv.analysis.untitled")}
                          </span>
                          <span className="block text-xs text-fg-3">
                            {t(data.last_analysis.kind === "gap" ? "dashboard2.cv.analysis.gap" : "dashboard2.cv.analysis.tailor")} ·{" "}
                            {fmtDate(data.last_analysis.created_at, locale)}
                          </span>
                        </span>
                        {data.last_analysis.match_score !== null && (
                          <span className="num font-display shrink-0 text-xl text-fg">{Math.round(data.last_analysis.match_score)}%</span>
                        )}
                      </Link>
                    )}
                    <Button asChild variant="secondary" size="sm" className="w-fit">
                      <Link href="/cv">
                        {t("nav.cv")} <ArrowRight className="rtl:rotate-180" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-fg-2">{t("dashboard2.cv.none.d")}</p>
                    <Button asChild size="sm">
                      <Link href="/cv">{t("dashboard2.cv.create")}</Link>
                    </Button>
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/** v1 activity item: an outlined row with an icon square, what happened, when, and the text. */
function ActivityItem({ item }: { item: Summary["recent_activity"][number] }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isPost = item.type === "linkedin_post";
  const Icon = isPost ? LinkedinIcon : Award;
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink bg-primary-soft text-fg" aria-hidden>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold text-fg-2">{t(isPost ? "dash.activity.linkedin_post" : "dash.activity.achievement")}</span>
          <time className="num shrink-0 text-xs text-fg-3" dateTime={item.created_at}>
            {fmtDate(item.created_at, locale)}
          </time>
        </span>
        {item.title && (
          <span className="mt-0.5 block text-sm font-bold break-words text-fg [overflow-wrap:anywhere]">
            <bdi>{item.title}</bdi>
          </span>
        )}
        {item.preview && (
          <span className={cn("mt-1 block text-sm leading-relaxed whitespace-pre-wrap text-fg-2", !expanded && "line-clamp-3")}>
            <bdi>{item.preview}</bdi>
          </span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {isPost ? (
        <div className="ink-soft flex items-start gap-3 px-4 py-3.5">
          {body}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 self-end text-xs font-semibold text-primary-text hover:underline"
          >
            {t(expanded ? "dash.activity.show_less" : "dash.activity.view_post")}
          </button>
        </div>
      ) : (
        <Link
          href={`/achievements?status=confirmed&open=${encodeURIComponent(item.id)}`}
          className="ink-soft flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {body}
        </Link>
      )}
    </li>
  );
}
