"use client";

import { AlertCircle, Award, Briefcase, Check, FileQuestion, GraduationCap, Medal, PenLine, Quote, Sparkles, Trash2, Upload, X } from "lucide-react";
import { GithubIcon as Github } from "@/components/brand-icons";
import Link from "next/link";
import { useState } from "react";
import { AiWorking, ErrorNote } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { splitList } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Achievement, CVUpdateResult } from "@/lib/types";
import { cn, fmtDate, isArabic } from "@/lib/utils";

export const CATEGORY_ICON = { project: Briefcase, certification: Award, experience: Briefcase, award: Medal, education: GraduationCap } as const;
const SOURCE_ICON = { manual: PenLine, github: Github, upload: Upload } as const;

export function cvUpdateMessage(r: CVUpdateResult | null | undefined, locale: string): { kind: "ok" | "info" | "error"; text: string } | null {
  if (!r) return null;
  const ar = locale === "ar";
  switch (r.status) {
    case "created":
      return { kind: "ok", text: ar ? "تم تجهيز مسودة تحديث للسيرة — راجعها في إدارة السيرة." : "A CV update draft is ready — review it in CV Manager." };
    case "exists":
      return { kind: "info", text: ar ? "توجد مسودة معلقة لهذا الإنجاز." : "A pending CV draft already exists for this achievement." };
    case "duplicate":
      return { kind: "info", text: (ar ? "موجود في سيرتك مسبقاً: " : "Already in your CV: ") + (r.reason ?? "") };
    case "no_cv":
      return { kind: "info", text: ar ? "أنشئ سيرتك الرئيسية لتحديثها تلقائياً." : "Create your Master CV to get automatic update drafts." };
    case "no_changes":
      return { kind: "info", text: ar ? "لم يقترح الذكاء الاصطناعي تغييرات آمنة." : "No safe CV changes were proposed." };
    case "ai_unavailable":
      return { kind: "error", text: r.reason ?? "AI unavailable" };
  }
}

export function AchievementCard({ a, onChanged, compact }: { a: Achievement; onChanged?: () => void; compact?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [note, setNote] = useState(a.contribution_note || "");
  const [busy, setBusy] = useState<string | null>(null);
  const Icon = CATEGORY_ICON[a.category] ?? Briefcase;
  const SIcon = SOURCE_ICON[a.source] ?? PenLine;
  const quotes = a.evidence.filter((e) => e.quote);

  async function act(kind: "confirm" | "reject" | "delete") {
    setBusy(kind);
    try {
      if (kind === "confirm") {
        const res = await api<{ cv_update: CVUpdateResult }>(`/api/achievements/${a.id}/confirm`, {
          method: "POST",
          json: { contribution_note: note, auto_cv_update: true },
        });
        const m = cvUpdateMessage(res.cv_update, locale);
        toast("ok", locale === "ar" ? "تم تأكيد الإنجاز" : "Achievement confirmed");
        if (m) toast(m.kind, m.text);
      } else if (kind === "reject") {
        await api(`/api/achievements/${a.id}/reject`, { method: "POST" });
      } else {
        await api(`/api/achievements/${a.id}`, { method: "DELETE" });
      }
      onChanged?.();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={cn("sketch pop-in flex flex-col gap-3 p-4", a.status === "pending" && "!bg-paper-2")}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-ink bg-sky">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-hand text-xl leading-tight" dir={isArabic(a.title) ? "rtl" : undefined}>
            {a.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
            <Badge tone={a.status === "confirmed" ? "ok" : a.status === "pending" ? "warn" : "neutral"}>{t(`ach.status.${a.status}` as never)}</Badge>
            <Badge>
              <SIcon /> {a.source_ref?.replace(/^upload:[^:]+:/, "").replace(/^github:/, "") || t(`src.${a.source}` as never)}
            </Badge>
            <Badge>{t(`ach.cat.${a.category}` as never)}</Badge>
            {a.status === "pending" && (
              <Badge tone={a.confidence >= 0.7 ? "sky" : "warn"}>
                {t("ach.confidence")} {Math.round(a.confidence * 100)}%
              </Badge>
            )}
            <span>{fmtDate(a.created_at, locale)}</span>
          </div>
        </div>
        {!compact && a.status !== "pending" && (
          <button onClick={() => act("delete")} className="rounded-lg p-2 text-ink-faint hover:bg-bad-fill hover:text-ink" aria-label={t("common.delete")}>
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {!compact && a.description && (
        <p className="text-sm text-ink-soft" dir={isArabic(a.description) ? "rtl" : undefined}>
          {a.description}
        </p>
      )}
      {!compact && a.impact && <p className="text-sm"><b>{t("ach.impact")}:</b> {a.impact}</p>}
      {[...a.technologies, ...a.skills].length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...new Set([...a.technologies, ...a.skills])].map((s) => (
            <Badge key={s} tone="sky">{s}</Badge>
          ))}
        </div>
      )}

      {a.status === "pending" && (
        <div className="flex flex-col gap-3 border-t-2 border-dashed border-ink/25 pt-3">
          {a.duplicate_of && (
            <div className="flex items-center gap-2 rounded-lg bg-warn-fill px-3 py-2 text-sm">
              <AlertCircle className="size-4" /> {t("ach.duplicate")} “{a.duplicate_of.title}”
            </div>
          )}
          {quotes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="font-hand text-base">{t("ach.evidence")}</div>
              {quotes.map((q, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <Quote className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span className="italic">“{q.quote}”</span>
                  <Badge tone="ok" className="ms-auto self-start"><Check /> {t("ach.verified_quote")}</Badge>
                </div>
              ))}
            </div>
          )}
          {!!a.dropped_terms?.length && (
            <div className="text-xs text-ink-faint">
              {t("ach.dropped")}: {a.dropped_terms.join(", ")}
            </div>
          )}
          {a.needs_contribution_confirmation && (
            <Field label={t("ach.contribution")} hint={a.contribution_question || t("ach.needs_contrib")}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" placeholder={t("ach.needs_contrib")} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="success" loading={busy === "confirm"} disabled={a.needs_contribution_confirmation && note.trim().length < 10} onClick={() => act("confirm")}>
              <Check /> {t("ach.confirm")}
            </Button>
            <Button size="sm" variant="outline" loading={busy === "reject"} onClick={() => act("reject")}>
              <X /> {t("common.reject")}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function AddAchievementDialog({ trigger, onDone }: { trigger: React.ReactNode; onDone?: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [free, setFree] = useState("");
  const [candidates, setCandidates] = useState<Achievement[] | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ title: "", description: "", category: "project", technologies: "", skills: "", impact: "", occurred_on: "" });
  const [dup, setDup] = useState<{ title: string } | null>(null);

  function reset() {
    setFree("");
    setCandidates(null);
    setError(null);
    setDup(null);
    setReason("");
    setForm({ title: "", description: "", category: "project", technologies: "", skills: "", impact: "", occurred_on: "" });
  }

  async function extract() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ candidates: Achievement[]; no_achievement_reason: string; injection_flags: string[] }>("/api/achievements/extract", {
        method: "POST",
        json: { text: free },
      });
      setCandidates(res.candidates);
      setReason(res.no_achievement_reason);
      if (res.injection_flags.length) toast("info", locale === "ar" ? "أزلنا نصاً يشبه التعليمات من مدخلاتك." : "We removed instruction-like text from your input.");
      onDone?.();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function save(force = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ cv_update: CVUpdateResult }>(`/api/achievements${force ? "?force=true" : ""}`, {
        method: "POST",
        json: { ...form, technologies: splitList(form.technologies), skills: splitList(form.skills) },
      });
      toast("ok", locale === "ar" ? "تمت إضافة الإنجاز" : "Achievement added");
      const m = cvUpdateMessage(res.cv_update, locale);
      if (m) toast(m.kind, m.text);
      setOpen(false);
      reset();
      onDone?.();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && typeof err.detail === "object" && err.detail && "duplicate_of" in err.detail) {
        setDup((err.detail as { duplicate_of: { title: string } }).duplicate_of);
      } else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent title={t("ach.add.title")} wide={!!candidates?.length}>
        <Tabs defaultValue="ai" onValueChange={() => setError(null)}>
          <TabsList>
            <TabsTrigger value="ai">
              <Sparkles className="me-1 inline size-4" /> {t("ach.extract")}
            </TabsTrigger>
            <TabsTrigger value="form">
              <PenLine className="me-1 inline size-4" /> {t("ach.manual")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ai" className="flex flex-col gap-4">
            {!candidates && (
              <>
                <Field label={t("ach.description")} hint={t("ach.extract.hint")}>
                  <Textarea value={free} onChange={(e) => setFree(e.target.value)} className="min-h-36" maxLength={12000} />
                </Field>
                {busy && <AiWorking steps={locale === "ar" ? ["تنقية", "استخراج", "تحقق من الأدلة", "كشف التكرار"] : ["sanitize", "extract", "verify evidence", "dedupe"]} />}
                <ErrorNote error={error} />
                <Button onClick={extract} loading={busy} disabled={free.trim().length < 20}>
                  <Sparkles /> {t("ach.extract")}
                </Button>
              </>
            )}
            {candidates && (
              <div className="flex flex-col gap-3">
                {candidates.length === 0 ? (
                  <div className="sketch-dashed flex items-center gap-3 p-4 text-sm">
                    <FileQuestion className="size-5" /> {reason || (locale === "ar" ? "لم نجد إنجازاً واضحاً." : "No clear achievement found.")}
                  </div>
                ) : (
                  candidates.map((c) => <AchievementCard key={c.id} a={c} onChanged={onDone} />)
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCandidates(null)}>
                    {t("common.back")}
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/discovery" onClick={() => setOpen(false)}>
                      {t("disc.review")}
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="form">
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Field label={t("ach.title")} className="sm:col-span-2">
                <Input required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label={t("ach.description")} className="sm:col-span-2">
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label={t("ach.category")}>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {(["project", "certification", "experience", "award", "education"] as const).map((c) => (
                    <option key={c} value={c}>
                      {t(`ach.cat.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("ach.date")}>
                <Input placeholder="2026-05" value={form.occurred_on} maxLength={20} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} />
              </Field>
              <Field label={t("ach.technologies")}>
                <Input value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} />
              </Field>
              <Field label={t("ach.skills")}>
                <Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
              </Field>
              <Field label={t("ach.impact")} className="sm:col-span-2">
                <Input value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} />
              </Field>
              {dup && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-fill p-3 text-sm sm:col-span-2">
                  <AlertCircle className="size-4" /> {t("ach.duplicate")} “{dup.title}”
                  <Button size="sm" variant="outline" type="button" className="ms-auto" onClick={() => save(true)}>
                    {locale === "ar" ? "احفظ على أي حال" : "Save anyway"}
                  </Button>
                </div>
              )}
              <div className="sm:col-span-2">
                <ErrorNote error={error} />
              </div>
              <Button type="submit" loading={busy} disabled={form.title.trim().length < 3} className="sm:col-span-2">
                {t("common.save")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
