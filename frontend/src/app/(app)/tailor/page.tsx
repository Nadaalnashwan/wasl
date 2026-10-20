"use client";

import { Download, History, Scissors, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CVView } from "@/components/cv";
import { AiWorking, EmptyState, ErrorNote } from "@/components/feedback";
import { ScoreExplain, ScoreGauge, SkillColumns } from "@/components/match";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, ApiError, download } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Analysis, CV, CVData } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export default function TailorPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const master = useApi<CV | null>("/api/cv/master");
  const history = useApi<Analysis[]>("/api/career/analyses?kind=tailor");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [res, setRes] = useState<{ analysis: Analysis; original: CVData; tailored: { id: string; title: string; data: CVData } } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setRes(await api("/api/career/tailor", { method: "POST", json: { job_text: jd } }));
      history.reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function openPast(id: string) {
    try {
      const a = await api<Analysis>(`/api/career/analyses/${id}`);
      if (a.tailored && a.original) setRes({ analysis: a, original: a.original, tailored: a.tailored });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  const a = res?.analysis;
  const enf = a?.result.enforcement;
  const hlIds = new Set(a?.result.highlighted_item_ids ?? []);

  return (
    <div>
      <PageHeader title={t("tailor.title")} sub={t("tailor.sub")} />
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
            <Field label={t("tailor.jd")} hint={`${jd.length} / 15000`}>
              <Textarea value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-48" maxLength={15000} dir="auto" />
            </Field>
            <div className="mt-4 flex flex-col gap-4">
              <ErrorNote error={error} />
              {busy && <AiWorking steps={locale === "ar" ? ["استخراج المتطلبات", "المطابقة", "إعادة الصياغة", "حارس المصداقية"] : ["extract requirements", "match evidence", "rewrite", "honesty guard"]} />}
              <Button size="lg" onClick={run} loading={busy} disabled={jd.trim().length < 80}>
                <Scissors /> {t("tailor.run")}
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
                    <button onClick={() => openPast(h.id)} className="sketch-soft flex w-full items-center gap-3 bg-paper p-3 text-start text-sm hover:bg-sky">
                      <span className="flex-1">
                        <b>{h.job_title || "—"}</b>
                        {h.company && <span className="text-ink-soft"> · {h.company}</span>}
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

      {a && res && (
        <div className="pop-in mt-10 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <Card className="flex flex-col items-center gap-4">
              <div className="text-center">
                <div className="font-hand text-2xl">{a.job_title || "—"}</div>
                {a.company && <div className="text-sm text-ink-soft">{a.company}</div>}
              </div>
              <ScoreGauge score={a.match_score ?? 0} label={t("tailor.score")} />
              <ScoreExplain score={a.result.score} />
            </Card>
            <div className="flex flex-col gap-4">
              <SkillColumns must={a.result.must} nice={a.result.nice} />
              {enf && (
                <div className="sketch-soft flex flex-wrap items-center gap-3 bg-ok-fill p-4 text-sm">
                  <ShieldCheck className="size-6" />
                  <b className="font-hand text-xl">{t("tailor.guard")}</b>
                  <span>
                    {enf.claims_checked} claims checked · <b>{enf.rejected_bullets}</b> {t("tailor.blocked")} · {enf.accepted_bullets} accepted
                  </span>
                </div>
              )}
              {!!a.result.notes?.length && (
                <ul className="list-disc ps-5 text-sm text-ink-soft">
                  {a.result.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <Card>
            <CardTitle
              action={
                <div className="flex gap-2">
                  {(["pdf", "docx"] as const).map((f) => (
                    <Button key={f} size="sm" variant="outline" onClick={() => download(`/api/cv/${res.tailored.id}/export?format=${f}`, `wasl_cv_tailored.${f}`).catch((e) => toast("error", e.message))}>
                      <Download /> {f.toUpperCase()}
                    </Button>
                  ))}
                </div>
              }
            >
              {res.tailored.title}
            </CardTitle>
            <Tabs defaultValue="side">
              <TabsList>
                <TabsTrigger value="side">
                  {t("tailor.original")} ↔ {t("tailor.tailored")}
                </TabsTrigger>
                <TabsTrigger value="tailored">{t("tailor.tailored")}</TabsTrigger>
              </TabsList>
              <TabsContent value="side" className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Badge className="mb-2">{t("tailor.original")}</Badge>
                  <CVView data={res.original} />
                </div>
                <div>
                  <Badge tone="brand" className="mb-2">
                    {t("tailor.tailored")}
                  </Badge>
                  <CVView data={res.tailored.data} highlight={{ ids: hlIds, summary: res.tailored.data.summary !== res.original.summary }} />
                </div>
              </TabsContent>
              <TabsContent value="tailored">
                <CVView data={res.tailored.data} highlight={{ ids: hlIds }} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      )}
    </div>
  );
}
