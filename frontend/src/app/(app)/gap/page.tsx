"use client";

import { ArrowLeft, BookOpen, FileText, Hammer, Lightbulb, Plus, ShieldAlert, Target, Zap } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AnalysisHistory } from "@/components/career/history";
import { SourceTag } from "@/components/career/requirements";
import { ScoreExplain, ScoreSummary } from "@/components/career/score";
import { AiWorking, EmptyState, ErrorNote, Notice, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Analysis, CV, LearningStep, SkillMatch } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

type Row = SkillMatch & { must: boolean };

const PRIO_RANK = { high: 0, medium: 1, low: 2 } as const;
const PRIO_TONE = { high: "bad", medium: "warn", low: "neutral" } as const;

const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);
const same = (a: string, b: string) => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

function ReportSection({
  id,
  eyebrow,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-border pt-8">
      {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
      <h2 id={`${id}-h`} className="flex items-center gap-2 text-heading font-semibold text-fg">
        {icon && <span className="text-fg-3 [&_svg]:size-4">{icon}</span>}
        {title}
      </h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-fg-3">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ReqLine({ r, children }: { r: Row; children?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <li className="grid gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium break-words text-fg" dir="auto">
          {r.skill}
        </span>
        <Badge tone={r.must ? "brand" : "neutral"}>{r.must ? t("career2.req.mustShort") : t("career2.req.niceShort")}</Badge>
      </div>
      <div className="min-w-0 text-sm text-fg-2">{children}</div>
    </li>
  );
}

export default function GapPage() {
  const { t, locale } = useI18n();
  const master = useApi<CV | null>("/api/cv/master");
  const history = useApi<Analysis[]>("/api/career/analyses?kind=gap");
  const [jd, setJd] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [a, setA] = React.useState<Analysis | null>(null);

  const top = () => requestAnimationFrame(() => document.getElementById("gap-top")?.scrollIntoView({ behavior: "smooth", block: "start" }));

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setA(await api<Analysis>("/api/career/gap", { method: "POST", json: { job_text: jd } }));
      history.reload();
      top();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const rows: Row[] = a ? [...a.result.must.map((m) => ({ ...m, must: true })), ...a.result.nice.map((m) => ({ ...m, must: false }))] : [];
  const verified = rows.filter((r) => r.status === "verified");
  const unverified = rows.filter((r) => r.status === "unverified");
  const missing = rows.filter((r) => r.status === "missing");
  const roadmap = a?.result.roadmap;
  const steps = roadmap?.steps ?? [];
  const weekEnds = steps.reduce<number[]>((acc, s) => [...acc, (acc.at(-1) ?? 0) + (s.est_weeks || 0)], []);
  const totalWeeks = weekEnds.at(-1) ?? 0;
  const stepFor = (skill: string) => {
    const i = steps.findIndex((s) => same(s.skill, skill));
    return i >= 0 ? { i, s: steps[i] as LearningStep } : null;
  };
  const priorities = steps.map((s, i) => ({ s, i })).sort((x, y) => PRIO_RANK[x.s.priority] - PRIO_RANK[y.s.priority] || x.i - y.i);
  const jdTooShort = jd.trim().length < 80;

  return (
    <div id="gap-top" className="scroll-mt-24">
      <PageHeader title={t("gap.title")} sub={t("career2.gap.sub")} />

      {master.loading && !master.data && <SkeletonRows rows={3} />}
      {master.error && <ErrorNote error={master.error} onRetry={master.reload} />}
      {!master.loading && !master.error && !master.data && (
        <EmptyState
          icon={<FileText />}
          title={t("cv.empty")}
          text={t("career2.needCv")}
          action={
            <Button asChild>
              <Link href="/cv">{t("nav.cv")}</Link>
            </Button>
          }
        />
      )}

      {master.data && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* ------------------------------------------------ main column */}
          <div className="min-w-0">
            {!a ? (
              <section aria-labelledby="gap-form-h" className="flex flex-col gap-5">
                <h2 id="gap-form-h" className="text-heading font-semibold text-fg">
                  {t("career2.gap.formTitle")}
                </h2>
                <Field
                  label={t("career2.gap.jd")}
                  hint={
                    <span className="num">
                      {jd.length.toLocaleString()} / 15,000 {jdTooShort && jd.length > 0 ? `· ${t("career2.jd.min")}` : ""}
                    </span>
                  }
                >
                  <Textarea value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-56" maxLength={15000} dir="auto" placeholder={t("career2.jd.ph")} />
                </Field>
                <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
                  {error && <ErrorNote error={error} />}
                  {busy && <AiWorking steps={[t("career2.gap.s1"), t("career2.gap.s2"), t("career2.gap.s3")]} />}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={run} loading={busy} disabled={jdTooShort}>
                    {!busy && <Target />} {t("gap.run")}
                  </Button>
                  <span className="text-xs text-fg-3">{fill(t("career2.gap.runHint"), { v: master.data.version })}</span>
                </div>
              </section>
            ) : (
              <article className="fade-in flex flex-col gap-10" aria-live="polite">
                {/* ---------------- target role header */}
                <header className="flex flex-col gap-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" className="-ms-3" onClick={() => setA(null)}>
                      <ArrowLeft className="rtl:rotate-180" /> {t("career2.gap.new")}
                    </Button>
                  </div>
                  <div>
                    <div className="eyebrow">{t("career2.gap.target")}</div>
                    <h2 className="mt-1.5 text-title font-semibold text-fg" dir="auto">
                      {a.job_title || "—"}
                    </h2>
                    <p className="mt-1.5 text-sm text-fg-3" dir="auto">
                      {[a.company, a.requirements?.seniority, fmtDate(a.created_at, locale)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ScoreSummary score={a.match_score} label={t("career2.gap.readiness")} must={a.result.must} nice={a.result.nice} className="max-w-md" />
                  <p className="max-w-2xl text-sm leading-relaxed text-fg-2">{t("career2.gap.disclaimer")}</p>
                  {!!a.result.injection_flags?.length && (
                    <Notice tone="warn" icon={<ShieldAlert />} title={t("career2.flags.title")}>
                      {t("career2.flags.text")}
                    </Notice>
                  )}
                  <nav aria-label={t("career2.gap.contents")} className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                    {[
                      ["gap-strengths", t("career2.gap.strengths"), verified.length],
                      ["gap-unverified", t("career2.gap.unverified"), unverified.length],
                      ["gap-missing", t("career2.gap.missing"), missing.length],
                      ["gap-roadmap", t("gap.roadmap"), steps.length],
                      ["gap-quick", t("gap.quickwins"), roadmap?.quick_wins.length ?? 0],
                    ].map(([id, label, n]) => (
                      <a key={id as string} href={`#${id}`} className="text-fg-2 hover:text-primary-text">
                        {label} <span className="num text-fg-3">{n}</span>
                      </a>
                    ))}
                  </nav>
                </header>

                {/* ---------------- strengths */}
                <ReportSection id="gap-strengths" title={t("career2.gap.strengths")} description={t("career2.gap.strengthsText")}>
                  {verified.length ? (
                    <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm [&>li]:px-4">
                      {verified.map((r, i) => (
                        <ReqLine key={r.skill + i} r={r}>
                          <ul className="flex flex-col gap-0.5">
                            {r.sources.map((s, j) => (
                              <li key={j}>
                                <SourceTag source={s} />
                              </li>
                            ))}
                          </ul>
                        </ReqLine>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-3">{t("career2.gap.noStrengths")}</p>
                  )}
                </ReportSection>

                {/* ---------------- unverified */}
                <ReportSection id="gap-unverified" title={t("career2.gap.unverified")} description={t("career2.gap.unverifiedText")}>
                  {unverified.length ? (
                    <>
                      <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm [&>li]:px-4">
                        {unverified.map((r, i) => {
                          const st = stepFor(r.skill);
                          return (
                            <ReqLine key={r.skill + i} r={r}>
                              <p className="text-xs text-fg-3">{t("career2.match.onlyListed")}</p>
                              <p className="mt-1.5">
                                <span className="font-medium text-fg">{t("career2.gap.howEvidence")}</span>{" "}
                                {st?.s.evidence_to_add || t("career2.gap.evidenceGeneric")}
                              </p>
                              {st && (
                                <a href={`#gap-step-${st.i + 1}`} className="mt-1 inline-block text-xs font-medium text-primary-text hover:underline">
                                  {fill(t("career2.gap.seeStep"), { n: st.i + 1 })}
                                </a>
                              )}
                            </ReqLine>
                          );
                        })}
                      </ul>
                      <Button asChild size="sm" variant="secondary" className="mt-4">
                        <Link href="/achievements">
                          <Plus /> {t("career2.gap.addEvidence")}
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-fg-3">{t("career2.gap.noUnverified")}</p>
                  )}
                </ReportSection>

                {/* ---------------- missing */}
                <ReportSection id="gap-missing" title={t("career2.gap.missing")} description={t("career2.gap.missingText")}>
                  {missing.length ? (
                    <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface shadow-sm [&>li]:px-4">
                      {missing.map((r, i) => {
                        const st = stepFor(r.skill);
                        return (
                          <ReqLine key={r.skill + i} r={r}>
                            <p className="text-xs text-fg-3">{t("career2.match.noEvidence")}</p>
                            {st ? (
                              <a href={`#gap-step-${st.i + 1}`} className="mt-1 inline-block text-xs font-medium text-primary-text hover:underline">
                                {fill(t("career2.gap.seeStep"), { n: st.i + 1 })}
                              </a>
                            ) : (
                              <p className="mt-1 text-xs text-fg-3">{t("career2.gap.notInRoadmap")}</p>
                            )}
                          </ReqLine>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-3">{t("career2.gap.noMissing")}</p>
                  )}
                </ReportSection>

                {/* ---------------- learning priorities */}
                {priorities.length > 0 && (
                  <ReportSection id="gap-priorities" eyebrow={t("career2.gap.recommendation")} title={t("career2.gap.priorities")} description={t("career2.gap.prioritiesText")}>
                    <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
                      {priorities.map(({ s, i }, k) => (
                        <li key={i} className="flex items-center gap-3 bg-surface px-4 py-3">
                          <span className="num w-5 shrink-0 text-sm font-semibold text-fg-3">{k + 1}</span>
                          <a href={`#gap-step-${i + 1}`} className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-primary-text" dir="auto">
                            {s.skill}
                          </a>
                          <Badge tone={PRIO_TONE[s.priority]}>{t(`prio.${s.priority}`)}</Badge>
                          <span className="num shrink-0 text-xs text-fg-3">
                            {s.est_weeks} {t("gap.weeks")}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </ReportSection>
                )}

                {/* ---------------- roadmap timeline */}
                <ReportSection
                  id="gap-roadmap"
                  eyebrow={t("career2.gap.recommendation")}
                  title={t("gap.roadmap")}
                  description={totalWeeks ? fill(t("career2.gap.roadmapText"), { n: totalWeeks }) : undefined}
                >
                  {roadmap?.overview && (
                    <p className="mb-6 max-w-2xl text-[15px] leading-relaxed text-fg-2" dir="auto">
                      {roadmap.overview}
                    </p>
                  )}
                  {steps.length ? (
                    <ol className="relative">
                      {steps.map((s, i) => {
                        const end = weekEnds[i];
                        const from = end - (s.est_weeks || 0);
                        return (
                          <li key={i} id={`gap-step-${i + 1}`} className="relative scroll-mt-24 ps-10 pb-8 last:pb-0">
                            {i < steps.length - 1 && <span aria-hidden className="absolute start-[13px] top-8 bottom-0 w-px bg-border" />}
                            <span
                              aria-hidden
                              className={cn(
                                "num absolute start-0 top-0 grid size-7 place-items-center rounded-full border text-xs font-semibold",
                                s.priority === "high" ? "border-primary bg-primary text-on-primary" : "border-border-strong bg-surface text-fg-2",
                              )}
                            >
                              {i + 1}
                            </span>
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <h3 className="text-[15px] font-semibold text-fg" dir="auto">
                                <span className="sr-only">
                                  {t("career2.step")} {i + 1}:{" "}
                                </span>
                                {s.skill}
                              </h3>
                              <Badge tone={PRIO_TONE[s.priority]}>
                                {t("career2.gap.priority")} {t(`prio.${s.priority}`)}
                              </Badge>
                              <span className="num ms-auto text-xs text-fg-3">
                                {s.est_weeks
                                  ? fill(t("career2.gap.weeksRange"), { from: from + 1, to: end, n: s.est_weeks })
                                  : t("career2.gap.noEstimate")}
                              </span>
                            </div>
                            {s.why && (
                              <p className="mt-1.5 text-sm leading-relaxed text-fg-2" dir="auto">
                                {s.why}
                              </p>
                            )}
                            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                              {s.resources.length > 0 && (
                                <div className="min-w-0">
                                  <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
                                    <BookOpen className="size-3.5" aria-hidden /> {t("career2.gap.resources")}
                                  </dt>
                                  <dd className="mt-1">
                                    <ul className="list-disc space-y-0.5 ps-4 text-fg-2 marker:text-fg-3">
                                      {s.resources.map((r, j) => (
                                        <li key={j} dir="auto">
                                          {r}
                                        </li>
                                      ))}
                                    </ul>
                                  </dd>
                                </div>
                              )}
                              {s.practice_project && (
                                <div className="min-w-0">
                                  <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
                                    <Hammer className="size-3.5" aria-hidden /> {t("career2.gap.project")}
                                  </dt>
                                  <dd className="mt-1 text-fg-2" dir="auto">
                                    {s.practice_project}
                                  </dd>
                                </div>
                              )}
                              {s.evidence_to_add && (
                                <div className="min-w-0 sm:col-span-2">
                                  <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-3">
                                    <Lightbulb className="size-3.5" aria-hidden /> {t("career2.gap.evidence")}
                                  </dt>
                                  <dd className="mt-1 text-fg-2" dir="auto">
                                    {s.evidence_to_add}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-sm text-fg-3">{t("career2.gap.noRoadmap")}</p>
                  )}
                  {steps.some((s) => s.resources.length > 0) && <p className="mt-6 text-xs text-fg-3">{t("career2.gap.resourcesCaveat")}</p>}
                </ReportSection>

                {/* ---------------- quick wins */}
                <ReportSection id="gap-quick" eyebrow={t("career2.gap.recommendation")} title={t("gap.quickwins")} icon={<Zap />} description={t("career2.gap.quickText")}>
                  {roadmap?.quick_wins.length ? (
                    <ul className="flex flex-col gap-2">
                      {roadmap.quick_wins.map((q, i) => (
                        <li key={i} className="flex gap-3 text-sm text-fg-2" dir="auto">
                          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-fg-3">{t("career2.gap.noQuick")}</p>
                  )}
                </ReportSection>
              </article>
            )}
          </div>

          {/* ------------------------------------------------ side column */}
          <aside className="flex min-w-0 flex-col gap-8">
            {a && <ScoreExplain score={a.result.score} />}
            <section aria-labelledby="gap-history-h">
              <h2 id="gap-history-h" className="text-heading font-semibold text-fg">
                {t("career2.hist.gapTitle")}
              </h2>
              <p className="mt-0.5 mb-3 text-sm text-fg-3">{t("career2.hist.gapText")}</p>
              {history.error && <ErrorNote error={history.error} onRetry={history.reload} />}
              {history.loading && !history.data ? (
                <SkeletonRows rows={2} />
              ) : (
                <AnalysisHistory
                  items={history.data ?? []}
                  activeId={a?.id}
                  onOpen={(h) => {
                    setA(h);
                    top();
                  }}
                  emptyText={t("career2.hist.gapNone")}
                />
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
