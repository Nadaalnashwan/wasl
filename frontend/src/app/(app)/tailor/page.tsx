"use client";

import { Briefcase, FileText, History, ScanSearch, Scissors, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { TailorHistory } from "@/components/career/history";
import { EvidenceMatrix, RequirementsList } from "@/components/career/requirements";
import { ScoreExplain, ScoreSummary } from "@/components/career/score";
import { BlockedChanges, computeTailorDiff, type Enforcement, SideBySide, SupportedChanges } from "@/components/career/tailor-review";
import { ExportButtons } from "@/components/cv/history";
import { AiWorking, EmptyState, ErrorNote, Notice, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Analysis, CV, CVData, Job } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

type Result = {
  analysis: Analysis;
  original: CVData | null;
  tailored: { id: string; title: string; data: CVData } | null;
  reopened: boolean;
};

const STEPS: { n: number; label: TKey; desc: TKey }[] = [
  { n: 1, label: "career2.step.1", desc: "career2.step.1.d" },
  { n: 2, label: "career2.step.2", desc: "career2.step.2.d" },
  { n: 3, label: "career2.step.3", desc: "career2.step.3.d" },
  { n: 4, label: "career2.step.4", desc: "career2.step.4.d" },
  { n: 5, label: "career2.step.5", desc: "career2.step.5.d" },
  { n: 6, label: "career2.step.6", desc: "career2.step.6.d" },
];

function Step({ n, children, aside, className }: { n: number; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  const { t } = useI18n();
  const s = STEPS[n - 1];
  return (
    <section id={`step-${n}`} aria-labelledby={`step-${n}-h`} className={cn("scroll-mt-24 border-t border-border pt-8", className)}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span aria-hidden className="num grid size-8 shrink-0 place-items-center rounded-full border border-border-strong text-sm font-semibold text-fg-2">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`step-${n}-h`} className="text-heading font-semibold text-fg">
            <span className="sr-only">
              {t("career2.step")} {n}:{" "}
            </span>
            {t(s.label)}
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-fg-3">{t(s.desc)}</p>
        </div>
        {aside}
      </div>
      <div className="mt-6 md:ps-12">{children}</div>
    </section>
  );
}

export default function TailorPage() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const master = useApi<CV | null>("/api/cv/master");
  const tailoredCVs = useApi<CV[]>("/api/cv/tailored");
  const history = useApi<Analysis[]>("/api/career/analyses?kind=tailor");

  const [jd, setJd] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [fromJob, setFromJob] = React.useState<Pick<Job, "title" | "company"> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [res, setRes] = React.useState<Result | null>(null);
  const [opening, setOpening] = React.useState(false);

  const scrollTo = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const openPast = React.useCallback(
    async (id: string) => {
      setOpening(true);
      try {
        const a = await api<Analysis>(`/api/career/analyses/${encodeURIComponent(id)}`);
        setRes({ analysis: a, original: a.original ?? null, tailored: a.tailored ?? null, reopened: true });
        scrollTo("step-2");
      } catch (e) {
        toast("error", (e as ApiError).message);
      } finally {
        setOpening(false);
      }
    },
    [toast],
  );

  // /tailor?job=<listing id> prefills the description (from Job Recommendations); /tailor?analysis=<id> reopens a past run.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const job = params.get("job");
    const analysis = params.get("analysis");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reopen a past run named in the URL, once on mount
    if (analysis) void openPast(analysis);
    if (!job) return;
    api<Job & { description: string }>(`/api/jobs/listings/${encodeURIComponent(job)}`)
      .then((j) => {
        setFromJob({ title: j.title, company: j.company });
        setJd([`${j.title}${j.company ? ` — ${j.company}` : ""}`, j.location, "", j.description].join("\n").slice(0, 15000));
      })
      .catch((e) => toast("error", (e as ApiError).message));
  }, [toast, openPast]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ analysis: Analysis; original: CVData; tailored: { id: string; title: string; data: CVData } }>("/api/career/tailor", {
        method: "POST",
        json: { job_text: jd, ...(sourceId ? { cv_id: sourceId } : {}) },
      });
      setRes({ analysis: r.analysis, original: r.original, tailored: r.tailored, reopened: false });
      history.reload();
      tailoredCVs.reload();
      scrollTo("step-2");
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const a = res?.analysis;
  const enforcement = a?.result.enforcement as Enforcement | undefined;
  const diff = res?.tailored && res.original ? computeTailorDiff(res.original, res.tailored.data) : null;
  const sourceCV = sourceId ? tailoredCVs.data?.find((c) => c.id === sourceId) : null;
  const jdTooShort = jd.trim().length < 80;

  return (
    <div>
      <PageHeader title={t("tailor.title")} sub={t("tailor.sub")} />

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
        <>
          <p className="mb-8 flex max-w-3xl items-start gap-2.5 text-sm leading-relaxed text-fg-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <span>{t("career2.tailor.promise")}</span>
          </p>


          {/* step 1 + previous runs */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <Card className="min-w-0">
              <CardTitle icon={<Scissors />} description={t("career2.step.1.d")}>
                {t("career2.step.1")}
              </CardTitle>
              <div className="flex flex-col gap-5">
                {fromJob && (
                  <Notice tone="info" icon={<Briefcase />}>
                    {t("tailor.fromjob")} <b className="text-fg">{fromJob.title}</b>
                    {fromJob.company && ` · ${fromJob.company}`}
                  </Notice>
                )}
                <Field
                  label={t("career2.tailor.source")}
                  hint={sourceCV ? t("career2.tailor.sourceTailoredHint") : fill(t("career2.tailor.sourceMasterHint"), { v: master.data.version })}
                >
                  <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                    <option value="">{fill(t("career2.tailor.masterOption"), { v: master.data.version })}</option>
                    {(tailoredCVs.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {t("career2.tailor.tailoredOption")} {c.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label={t("tailor.jd")}
                  hint={
                    <span className="num">
                      {jd.length.toLocaleString()} / 15,000 {jdTooShort && jd.length > 0 ? `· ${t("career2.jd.min")}` : ""}
                    </span>
                  }
                >
                  <Textarea
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    className="min-h-56"
                    maxLength={15000}
                    dir="auto"
                    placeholder={t("career2.jd.ph")}
                  />
                </Field>
                <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
                  {error && <ErrorNote error={error} />}
                  {busy && <AiWorking steps={[t("career2.tailor.s1"), t("career2.tailor.s2"), t("career2.tailor.s3"), t("career2.tailor.s4")]} />}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={run} loading={busy} disabled={jdTooShort}>
                    {!busy && <ScanSearch />} {t("tailor.run")}
                  </Button>
                  <span className="text-xs text-fg-3">{t("career2.tailor.runHint")}</span>
                </div>
              </div>
            </Card>

            <aside aria-labelledby="tailor-history-h" className="ink-card min-w-0 !bg-primary-soft p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink bg-surface text-fg" aria-hidden>
                  <History className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <h2 id="tailor-history-h" className="font-display text-xl leading-tight text-fg">
                    {t("tailor.history")}
                  </h2>
                  <p className="mt-0.5 text-sm text-fg-2">{t("career2.hist.tailorText")}</p>
                </div>
              </div>
              {(history.error || tailoredCVs.error) && (
                <ErrorNote
                  error={history.error ?? tailoredCVs.error}
                  onRetry={() => {
                    history.reload();
                    tailoredCVs.reload();
                  }}
                />
              )}
              {(history.loading && !history.data) || (tailoredCVs.loading && !tailoredCVs.data) ? (
                <SkeletonRows rows={2} />
              ) : (
                <TailorHistory
                  analyses={history.data ?? []}
                  tailored={tailoredCVs.data ?? []}
                  activeId={a?.id}
                  onOpen={openPast}
                  onDeleted={() => {
                    tailoredCVs.reload();
                    history.reload();
                    if (res?.tailored) {
                      // the open result may reference the deleted copy
                      api<CV[]>("/api/cv/tailored")
                        .then((list) => {
                          if (!list.some((c) => c.id === res.tailored?.id)) setRes((r) => (r ? { ...r, tailored: null } : r));
                        })
                        .catch(() => undefined);
                    }
                  }}
                />
              )}
            </aside>
          </div>

          {opening && <SkeletonRows rows={2} />}

          {/* steps 2–6 */}
          {a && res && (
            <div className="fade-in mt-12 flex flex-col gap-12" aria-live="polite">
              <header className="ink-card flex flex-wrap items-end gap-x-6 gap-y-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-fg-3">
                    {res.reopened ? t("career2.result.reopened") : t("career2.result.new")} · <span className="num">{fmtDate(a.created_at, locale)}</span>
                  </div>
                  <div className="mt-0.5 text-heading font-semibold text-fg" dir="auto">
                    {[a.job_title || "—", a.company].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Badge tone="warn">{t("career2.result.draft")}</Badge>
              </header>

              {!!a.result.injection_flags?.length && (
                <Notice tone="warn" icon={<ShieldAlert />} title={t("career2.flags.title")}>
                  {t("career2.flags.text")}
                </Notice>
              )}

              <Step n={2}>
                <RequirementsList req={a.requirements} />
              </Step>

              <Step n={3}>
                <div className="flex flex-col gap-8">
                  <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-start">
                    <ScoreSummary score={a.match_score} label={t("tailor.score")} must={a.result.must} nice={a.result.nice} />
                    <ScoreExplain score={a.result.score} />
                  </div>
                  <EvidenceMatrix must={a.result.must} nice={a.result.nice} />
                  <p className="text-xs text-fg-3">
                    {t("career2.match.improve")}{" "}
                    <Link href="/gap" className="font-medium text-primary-text hover:underline">
                      {t("career2.match.toGap")}
                    </Link>
                  </p>
                </div>
              </Step>

              <Step n={4}>
                {diff && res.tailored ? (
                  <div className="flex flex-col gap-10">
                    <SupportedChanges diff={diff} original={res.original} tailored={res.tailored.data} enforcement={enforcement} notes={a.result.notes} highlightedIds={a.result.highlighted_item_ids} />
                    <section aria-labelledby="blocked-h">
                      <h3 id="blocked-h" className="mb-1 text-sm font-semibold text-fg">
                        {t("career2.blk.title")}
                      </h3>
                      <p className="mb-3 text-xs text-fg-3">{t("career2.blk.text")}</p>
                      <BlockedChanges enforcement={enforcement} original={res.original} />
                    </section>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <Notice tone="warn">{res.tailored ? t("career2.cmp.noOriginal") : t("career2.result.cvDeleted")}</Notice>
                    <BlockedChanges enforcement={enforcement} original={res.original} />
                  </div>
                )}
              </Step>

              <Step n={5}>
                {res.tailored && diff ? (
                  <SideBySide original={res.original} tailored={res.tailored.data} diff={diff} reopened={res.reopened} />
                ) : res.tailored ? (
                  <SideBySide original={null} tailored={res.tailored.data} diff={computeTailorDiff(res.tailored.data, res.tailored.data)} />
                ) : (
                  <p className="text-sm text-fg-3">{t("career2.result.cvDeleted")}</p>
                )}
              </Step>

              <Step n={6}>
                {res.tailored ? (
                  <div className="flex flex-col gap-4 ink-soft p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-fg" dir="auto">
                        {res.tailored.title}
                      </div>
                      <p className="mt-0.5 text-sm text-fg-3">{t("career2.export.text")}</p>
                    </div>
                    <ExportButtons cv={{ id: res.tailored.id }} size="sm" label={`${t("cv2.export.label")}: ${res.tailored.title}`} />
                  </div>
                ) : (
                  <p className="text-sm text-fg-3">{t("career2.result.cvDeleted")}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <Link href="/cv" className="font-medium text-primary-text hover:underline">
                    {t("career2.export.toCv")}
                  </Link>
                  <button
                    type="button"
                    className="font-medium text-primary-text hover:underline"
                    onClick={() => {
                      setRes(null);
                      setJd("");
                      setFromJob(null);
                      scrollTo("step-1");
                    }}
                  >
                    {t("career2.export.another")}
                  </button>
                </div>
              </Step>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fill(s: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);
}
