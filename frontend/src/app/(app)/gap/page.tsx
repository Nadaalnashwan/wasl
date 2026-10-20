"use client";

import { BookOpen, Flag, Hammer, History, Lightbulb, Target } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AiWorking, EmptyState, ErrorNote } from "@/components/feedback";
import { ScoreExplain, ScoreGauge, SkillColumns } from "@/components/match";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Analysis, CV } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export default function GapPage() {
  const { t, locale } = useI18n();
  const master = useApi<CV | null>("/api/cv/master");
  const history = useApi<Analysis[]>("/api/career/analyses?kind=gap");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [a, setA] = useState<Analysis | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setA(await api<Analysis>("/api/career/gap", { method: "POST", json: { job_text: jd } }));
      history.reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const roadmap = a?.result.roadmap;
  const weekEnds = (roadmap?.steps ?? []).reduce<number[]>((acc, s) => [...acc, (acc.at(-1) ?? 0) + s.est_weeks], []);

  return (
    <div>
      <PageHeader title={t("gap.title")} sub={t("gap.sub")} />
      {!master.loading && !master.data && (
        <EmptyState
          title={t("cv.empty")}
          action={
            <Button asChild>
              <Link href="/cv">{t("nav.cv")}</Link>
            </Button>
          }
        />
      )}
      {master.data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <Field label={locale === "ar" ? "الوظيفة المستهدفة (الصق الوصف)" : "Target job (paste the description)"}>
              <Textarea value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-44" maxLength={15000} dir="auto" />
            </Field>
            <div className="mt-4 flex flex-col gap-4">
              <ErrorNote error={error} />
              {busy && <AiWorking steps={locale === "ar" ? ["استخراج المتطلبات", "مطابقة الأدلة", "بناء الخطة"] : ["extract requirements", "match evidence", "build roadmap"]} />}
              <Button size="lg" onClick={run} loading={busy} disabled={jd.trim().length < 80}>
                <Target /> {t("gap.run")}
              </Button>
            </div>
          </Card>
          <Card tone="tint">
            <CardTitle icon={<History />}>{t("tailor.history")}</CardTitle>
            {!history.data?.length ? (
              <p className="text-sm text-ink-soft">{t("common.none")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history.data.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => setA(h)} className="sketch-soft flex w-full items-center gap-3 bg-paper p-3 text-start text-sm hover:bg-sky">
                      <span className="flex-1">
                        <b>{h.job_title || "—"}</b>
                        <span className="block text-xs text-ink-faint">{fmtDate(h.created_at, locale)}</span>
                      </span>
                      <span className="font-hand text-2xl">{h.match_score}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {a && (
        <div className="pop-in mt-10 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <Card className="flex flex-col items-center gap-4">
              <div className="text-center font-hand text-2xl">{a.job_title || "—"}</div>
              <ScoreGauge score={a.match_score ?? 0} label={locale === "ar" ? "الجاهزية الحالية" : "Current readiness"} />
              <ScoreExplain score={a.result.score} />
            </Card>
            <SkillColumns must={a.result.must} nice={a.result.nice} />
          </div>

          {roadmap && (
            <Card>
              <CardTitle icon={<Flag />}>{t("gap.roadmap")}</CardTitle>
              {roadmap.overview && <p className="mb-6 text-ink-soft">{roadmap.overview}</p>}
              <ol className="relative flex flex-col gap-5 border-s-[3px] border-dashed border-ink/40 ps-6">
                {roadmap.steps.map((s, i) => {
                  const week = weekEnds[i];
                  const from = week - s.est_weeks;
                  return (
                    <li key={i} className="relative">
                      <span
                        className={cn(
                          "absolute -start-[39px] top-1 grid size-7 place-items-center rounded-full border-[2.5px] border-ink font-hand text-sm",
                          s.priority === "high" ? "bg-brand text-brand-ink" : s.priority === "medium" ? "bg-sky" : "bg-paper",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="sketch-soft flex flex-col gap-2 bg-paper-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="font-hand text-xl">{s.skill}</b>
                          <Badge tone={s.priority === "high" ? "bad" : s.priority === "medium" ? "warn" : "neutral"}>{t(`prio.${s.priority}`)}</Badge>
                          <span className="ms-auto text-xs text-ink-faint">
                            {locale === "ar" ? "الأسبوع" : "week"} {from + 1}–{week} · {s.est_weeks} {t("gap.weeks")}
                          </span>
                        </div>
                        {s.why && <p className="text-sm text-ink-soft">{s.why}</p>}
                        <div className="grid gap-2 text-sm md:grid-cols-3">
                          {s.resources.length > 0 && (
                            <div className="flex gap-2">
                              <BookOpen className="mt-0.5 size-4 shrink-0" />
                              <span>{s.resources.join(" · ")}</span>
                            </div>
                          )}
                          {s.practice_project && (
                            <div className="flex gap-2">
                              <Hammer className="mt-0.5 size-4 shrink-0" />
                              <span>{s.practice_project}</span>
                            </div>
                          )}
                          {s.evidence_to_add && (
                            <div className="flex gap-2">
                              <Lightbulb className="mt-0.5 size-4 shrink-0" />
                              <span>{s.evidence_to_add}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {roadmap.quick_wins.length > 0 && (
                <div className="sketch-soft mt-6 bg-sky p-4">
                  <div className="mb-2 font-hand text-xl">{t("gap.quickwins")}</div>
                  <ul className="list-disc ps-5 text-sm">
                    {roadmap.quick_wins.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
