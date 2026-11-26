"use client";

import { ArrowRight, Briefcase, CheckCircle2, ChevronRight, PenLine, Plus, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { WaslMachine } from "@/components/brand/art";
import { AddAchievementDialog } from "@/components/achievements";
import { fmt } from "@/components/achievements/shared";
import { ClaimSummary } from "@/components/claims";
import { EmptyState, ErrorNote, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { DescriptionList, Section, Status, type BadgeTone } from "@/components/ui/card";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";
import type { Achievement, JobsResponse, Post } from "@/lib/types";
import { cn, fmtDate, isArabic } from "@/lib/utils";

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

function AttentionList({ items }: { items: AttentionItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-ok/25 bg-ok-soft px-4 py-3.5 text-sm text-fg">
        <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden /> {t("dashboard2.attention.none")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm [&>li]:px-4">
      {items.map((it) => (
        <li key={it.id}>
          <Link
            href={it.href}
            className="group -mx-3 flex items-start gap-3 rounded-md px-3 py-3.5 transition-colors hover:bg-surface/70 focus-visible:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <Status tone={PRIO_TONE[it.priority]} className="mt-1 shrink-0">
              <span className="sr-only">{t(`dashboard2.prio.${it.priority}`)}</span>
            </Status>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">{it.text}</span>
              {it.detail && <span className="mt-0.5 line-clamp-2 block text-sm text-fg-3">{it.detail}</span>}
              {it.note && <span className="mt-0.5 block text-xs text-fg-3">{it.note}</span>}
            </span>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3 opacity-60 group-hover:opacity-100 rtl:rotate-180" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary-text hover:underline">
      {children} <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
    </Link>
  );
}

function PublishedPost({ id, preview, at }: { id: string; preview: string; at: string }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const contentId = `post-preview-${id}`;
  return (
    <li className="py-3.5 first:pt-0">
      <time className="text-xs text-fg-3" dateTime={at}>
        {fmtDate(at, locale)}
      </time>
      <p
        id={contentId}
        className={cn("mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]", !expanded && "line-clamp-3")}
        dir="auto"
      >
        {preview}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 rounded-sm text-xs font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {t(expanded ? "dash.activity.show_less" : "dash.activity.view_post")}
      </button>
    </li>
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
  const recentAch = data?.recent_activity.filter((a) => a.type === "achievement") ?? [];
  const recentPosts = data?.recent_activity.filter((a) => a.type === "linkedin_post") ?? [];
  const drafts = (posts.data ?? []).filter((p) => p.status === "draft").slice(0, 2);

  function refreshAll() {
    reload();
    pending.reload();
  }

  return (
    <div className="flex flex-col gap-10">
      {/* welcome band: the brand colour with the Wasl machine, like the landing's band */}
      <header className="relative overflow-hidden rounded-3xl bg-[linear-gradient(160deg,var(--band)_0%,var(--band-2)_100%)] px-6 py-8 text-on-band sm:px-10 sm:py-10">
        <WaslMachine className="pointer-events-none absolute end-6 -bottom-10 hidden h-[17rem] w-auto xl:block" />
        <div className="relative z-10 flex flex-col gap-6 xl:max-w-[56%]">
        <div className="min-w-0">
          <p className="mb-3 text-sm font-semibold text-on-band-2">
            <time dateTime={new Date().toISOString().slice(0, 10)}>
              {new Date().toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </time>
          </p>
          <h1 className="font-display brand-underline text-[2.25rem] leading-[1.1] text-on-band sm:text-[2.75rem]">
            {name ? fmt(t("dashboard2.greeting"), { name }) : t("dashboard2.greeting.anon")}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-on-band-2" dir="auto">
            {data?.user.headline || t("dashboard2.sub")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label={t("dashboard2.quick")} className="flex flex-wrap items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="text-on-band hover:bg-on-band/15 hover:text-on-band">
              <Link href="/studio">
                <PenLine /> {t("nav.studio")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-on-band hover:bg-on-band/15 hover:text-on-band">
              <Link href="/jobs">
                <Briefcase /> {t("nav.jobs")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-on-band hover:bg-on-band/15 hover:text-on-band">
              <Link href="/tailor">
                <ScanSearch /> {t("nav.tailor")}
              </Link>
            </Button>
          </nav>
          <AddAchievementDialog
            onDone={refreshAll}
            trigger={
              <Button className="bg-surface text-primary-text hover:bg-primary-soft">
                <Plus /> {t("dashboard2.ach.add")}
              </Button>
            }
          />
        </div>
        </div>
      </header>

      <ErrorNote error={error} onRetry={reload} />

      {loading && !data && <SkeletonRows rows={3} />}

      {data && (
        <>
          <Section title={t("dashboard2.attention.title")} description={t("dashboard2.attention.d")}>
            <div aria-live="polite">
              <AttentionList items={attention} />
            </div>
          </Section>

          <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {/* ---------------------------------------------------------------- achievements */}
            <div className="flex min-w-0 flex-col gap-10">
              <Section
                title={t("dashboard2.ach.title")}
                description={
                  <span className="num">
                    {fmt(t("dashboard2.ach.counts"), { c: data.achievements.confirmed, p: data.achievements.pending, r: data.achievements.rejected })}
                  </span>
                }
                action={<SectionLink href="/achievements">{t("dashboard2.ach.all")}</SectionLink>}
              >
                {recentAch.length === 0 ? (
                  <EmptyState title={t("dashboard2.ach.empty")} text={t("dashboard2.ach.empty.d")} />
                ) : (
                  <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm [&>li]:px-4">
                    {recentAch.map((a) => (
                      <li key={a.id}>
                        <Link
                          href={`/achievements?status=confirmed&open=${encodeURIComponent(a.id)}`}
                          className="group flex items-start gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className="block text-sm font-medium break-words text-fg group-hover:text-primary-text [overflow-wrap:anywhere]"
                              dir={isArabic(a.title) ? "rtl" : undefined}
                            >
                              {a.title}
                            </span>
                            {a.preview && (
                              <span className="mt-0.5 line-clamp-2 block text-sm text-fg-3" dir={isArabic(a.preview) ? "rtl" : undefined}>
                                {a.preview}
                              </span>
                            )}
                          </span>
                          <time className="num shrink-0 pt-0.5 text-xs text-fg-3" dateTime={a.created_at}>
                            {fmtDate(a.created_at, locale)}
                          </time>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {recentPosts.length > 0 && (
                <Section title={t("dashboard2.posts.title")}>
                  <ul className="divide-y divide-border">
                    {recentPosts.map((p) => (
                      <PublishedPost key={p.id} id={p.id} preview={p.preview} at={p.created_at} />
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            {/* ---------------------------------------------------------------- side column */}
            <aside className="flex min-w-0 flex-col gap-10">
              <Section title={t("dashboard2.cv.title")} action={data.cv.exists ? <SectionLink href="/cv">{t("dashboard2.cv.open")}</SectionLink> : undefined}>
                <div className="flex flex-col gap-4 border-t border-border pt-4">
                  {data.cv.exists ? (
                    <>
                      <div>
                        <p className="text-sm font-medium text-fg">{fmt(t("dashboard2.cv.version"), { v: data.cv.version ?? "—" })}</p>
                        <p className="text-xs text-fg-3">{fmt(t("dashboard2.cv.updated"), { d: fmtDate(data.cv.updated_at, locale) })}</p>
                      </div>
                      {data.cv.pending_suggestions > 0 ? (
                        <Link href="/cv" className="inline-flex items-center gap-2 text-sm font-medium text-warn hover:underline">
                          <Status tone="warn">
                            <span className="sr-only">{t("dashboard2.prio.high")}</span>
                          </Status>
                          {fmt(t("dashboard2.cv.drafts"), { n: data.cv.pending_suggestions })}
                        </Link>
                      ) : (
                        <Status tone="ok">{t("dashboard2.cv.no_drafts")}</Status>
                      )}
                      {data.cv.sections && (
                        <div className="border-t border-border pt-4">
                          <h3 className="mb-2 text-xs font-medium text-fg-3">{t("dashboard2.cv.sections")}</h3>
                          <DescriptionList
                            items={Object.entries(data.cv.sections).map(([k, v]) => ({
                              label: t(`cv.section.${k}` as TKey),
                              value: <span className={cn("num", v === 0 && "text-fg-3")}>{fmt(t("dashboard2.cv.items"), { n: v })}</span>,
                            }))}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-start gap-3">
                      <div>
                        <p className="text-sm font-medium text-fg">{t("dashboard2.cv.none")}</p>
                        <p className="mt-0.5 text-sm text-fg-3">{t("dashboard2.cv.none.d")}</p>
                      </div>
                      <Button asChild variant="secondary" size="sm">
                        <Link href="/cv">{t("dashboard2.cv.create")}</Link>
                      </Button>
                    </div>
                  )}

                  {data.last_analysis && (
                    <Link
                      href={data.last_analysis.kind === "gap" ? "/gap" : "/tailor"}
                      className="group -mx-1 flex items-center gap-3 rounded-lg border-t border-border px-1 pt-4 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-fg-3">
                          {t("dashboard2.cv.last_analysis")} · {t(data.last_analysis.kind === "gap" ? "dashboard2.cv.analysis.gap" : "dashboard2.cv.analysis.tailor")}
                        </span>
                        <span className="block truncate font-medium text-fg group-hover:text-primary-text" dir="auto">
                          {data.last_analysis.job_title || t("dashboard2.cv.analysis.untitled")}
                        </span>
                        <span className="block text-xs text-fg-3">{fmtDate(data.last_analysis.created_at, locale)}</span>
                      </span>
                      {data.last_analysis.match_score !== null && (
                        <span className="num shrink-0 text-sm font-semibold text-fg">
                          {fmt(t("dashboard2.cv.analysis.match"), { n: data.last_analysis.match_score })}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              </Section>

              <Section title={t("dashboard2.content.title")} action={<SectionLink href="/studio">{t("dashboard2.content.open")}</SectionLink>}>
                {data.posts.draft + data.posts.published + data.posts.failed === 0 ? (
                  <p className="text-sm text-fg-3">{t("dashboard2.content.empty")}</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <dl className="grid grid-cols-3 divide-x divide-border border-y border-border py-3 rtl:divide-x-reverse">
                      {(
                        [
                          ["dashboard2.content.drafts", data.posts.draft],
                          ["dashboard2.content.published", data.posts.published],
                          ["dashboard2.content.failed", data.posts.failed],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k} className="min-w-0 px-3 first:ps-0">
                          <dt className="text-xs text-fg-3">{t(k)}</dt>
                          <dd className={cn("num mt-0.5 text-lg font-semibold", k === "dashboard2.content.failed" && v > 0 ? "text-bad" : "text-fg")}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {drafts.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-fg-3">{t("dashboard2.content.latest")}</h3>
                        <ul className="flex flex-col gap-3">
                          {drafts.map((p) => (
                            <li key={p.id}>
                              <Link href="/studio" className="group block">
                                <span className="line-clamp-2 text-sm text-fg group-hover:text-primary-text" dir="auto">
                                  {p.content}
                                </span>
                              </Link>
                              <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-fg-3">
                                <span>{fmtDate(p.updated_at, locale)}</span>
                                <ClaimSummary report={p.claim_check} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section
                title={t("dashboard2.jobs.title")}
                action={jobs.data?.items.length ? <SectionLink href="/jobs">{t("dash.jobs.all")}</SectionLink> : undefined}
              >
                {jobs.data?.items.length ? (
                  <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm [&>li]:px-4">
                    {jobs.data.items.map((j) => (
                      <li key={j.id}>
                        <Link href="/jobs" className="group flex items-start gap-3 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-fg group-hover:text-primary-text" dir="auto">
                              {j.title}
                            </span>
                            <span className="block truncate text-xs text-fg-3" dir="auto">
                              {[j.company, j.city || j.location].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="num shrink-0 text-sm font-semibold text-fg">{fmt(t("dashboard2.jobs.match"), { n: Math.round(j.match.score) })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : jobs.loading && !jobs.data ? (
                  <SkeletonRows rows={1} />
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-fg-3">{jobs.data?.state === "no_cv" ? t("jobs.nocv.d") : t("dash.jobs.empty")}</p>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={jobs.data?.state === "no_cv" ? "/cv" : "/jobs"}>
                        <Briefcase /> {jobs.data?.state === "no_cv" ? t("nav.cv") : t("jobs.refresh")}
                      </Link>
                    </Button>
                  </div>
                )}
              </Section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
