"use client";

import { Check, Download, FilePlus2, GitCompare, History, PenLine, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { CVEditor, CVView, EMPTY_CV, normalizeCV } from "@/components/cv";
import { AiWorking, EmptyState, ErrorNote, Loading } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api, ApiError, download, upload } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { CV, CVData, Suggestion } from "@/lib/types";
import { fmtDate, timeAgo } from "@/lib/utils";

type Version = { version: number; change_summary: string; created_at: string };

function ExportButtons({ cv }: { cv: CV }) {
  const { t } = useI18n();
  const toast = useToast();
  const go = (fmt: "pdf" | "docx") => download(`/api/cv/${cv.id}/export?format=${fmt}`, `wasl_cv.${fmt}`).catch((e) => toast("error", e.message));
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => go("pdf")}>
        <Download /> {t("cv.export.pdf")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => go("docx")}>
        <Download /> {t("cv.export.docx")}
      </Button>
    </div>
  );
}

function SuggestionCard({ s, master, onDone }: { s: Suggestion; master: CVData; onDone: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CVData>(normalizeCV(s.draft_data));
  const [compare, setCompare] = useState(true);

  const ids = new Set(s.changes.map((c) => c.item_id).filter(Boolean) as string[]);
  const bullets = new Set(s.changes.map((c) => c.bullet).filter(Boolean) as string[]);
  const skills = new Set(s.changes.flatMap((c) => c.skills ?? []));

  async function act(kind: "accept" | "reject" | "edit") {
    setBusy(kind);
    try {
      if (kind === "edit") await api(`/api/cv/suggestions/${s.id}/edit`, { method: "POST", json: { draft_data: draft } });
      else await api(`/api/cv/suggestions/${s.id}/${kind}`, { method: "POST" });
      toast(kind === "reject" ? "info" : "ok", kind === "reject" ? (locale === "ar" ? "تم رفض الاقتراح" : "Suggestion discarded") : locale === "ar" ? "تم تحديث السيرة الرئيسية" : "Master CV updated");
      setEditing(false);
      onDone();
    } catch (e) {
      toast("error", (e as ApiError).message);
      if ((e as ApiError).status === 409) onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="pop-in flex flex-col gap-4 !bg-paper-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">{t("cv.draft")}</Badge>
        <span className="text-xs text-ink-faint">
          v{s.base_version} → v{s.base_version + 1} · {timeAgo(s.created_at)}
        </span>
        <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setCompare(!compare)}>
          <GitCompare /> {compare ? t("cv.draft") : `${t("cv.current")} ↔ ${t("cv.draft")}`}
        </Button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {s.changes.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-ink bg-sky text-xs font-bold">+</span>
            <span>
              <b>{c.summary}</b>
              {c.bullet && <span className="block text-ink-soft">“{c.bullet}”</span>}
              {c.reason && <span className="block text-xs text-ink-faint">{c.reason}</span>}
            </span>
          </li>
        ))}
      </ul>
      {s.rationale && <p className="text-xs text-ink-faint">{s.rationale}</p>}
      <div className={compare ? "grid gap-4 lg:grid-cols-2" : ""}>
        {compare && (
          <div>
            <div className="mb-2 font-hand text-lg">{t("cv.current")}</div>
            <CVView data={master} className="max-h-[520px] overflow-y-auto" />
          </div>
        )}
        <div>
          {compare && <div className="mb-2 font-hand text-lg">{t("cv.draft")}</div>}
          <CVView data={s.draft_data} highlight={{ ids, bullets, skills }} className="max-h-[520px] overflow-y-auto !bg-paper" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" onClick={() => act("accept")} loading={busy === "accept"}>
          <Check /> {t("common.accept")}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <PenLine /> {t("common.edit")}
        </Button>
        <Button variant="outline" onClick={() => act("reject")} loading={busy === "reject"}>
          <X /> {t("common.reject")}
        </Button>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`${t("common.edit")} — ${t("cv.draft")}`} wide>
          <CVEditor value={draft} onChange={setDraft} />
          <div className="sticky bottom-0 mt-5 flex justify-end gap-2 bg-paper pt-3">
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => act("edit")} loading={busy === "edit"}>
              <Check /> {t("common.accept")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function CVPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const master = useApi<CV | null>("/api/cv/master");
  const suggestions = useApi<Suggestion[]>("/api/cv/suggestions?status=pending");
  const versions = useApi<Version[]>("/api/cv/versions");
  const tailored = useApi<CV[]>("/api/cv/tailored");
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [uploadErr, setUploadErr] = useState<ApiError | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState("");
  const [working, setWorking] = useState<CVData>(EMPTY_CV);
  const [summary, setSummary] = useState("Edited manually");
  const [saving, setSaving] = useState(false);
  const [viewVersion, setViewVersion] = useState<{ version: number; data: CVData } | null>(null);

  const reloadAll = () => {
    master.reload();
    suggestions.reload();
    versions.reload();
  };

  async function onFile(f: File | undefined) {
    if (!f) return;
    setParsing(true);
    setUploadErr(null);
    try {
      const res = await upload<{ parsed: CVData; injection_flags: string[] }>("/api/cv/upload", f);
      if (res.injection_flags.length) toast("info", locale === "ar" ? "أزلنا نصاً مشبوهاً من الملف." : "Suspicious instruction-like text was removed from the file.");
      setWorking(normalizeCV(res.parsed));
      setEditorTitle(t("cv.review.title"));
      setSummary(`Imported from ${f.name}`);
      setEditorOpen(true);
    } catch (e) {
      setUploadErr(e as ApiError);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveMaster() {
    setSaving(true);
    try {
      await api("/api/cv/master", { method: "PUT", json: { data: working, change_summary: summary } });
      toast("ok", locale === "ar" ? "تم حفظ السيرة الرئيسية" : "Master CV saved");
      setEditorOpen(false);
      reloadAll();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function openVersion(v: number) {
    try {
      setViewVersion(await api(`/api/cv/versions/${v}`));
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  async function restore(v: number) {
    try {
      await api(`/api/cv/versions/${v}/restore`, { method: "POST" });
      toast("ok", `v${v} restored`);
      setViewVersion(null);
      reloadAll();
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  const cv = master.data;

  return (
    <div>
      <PageHeader
        title={t("cv.title")}
        sub={t("cv.sub")}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={parsing}>
              <Upload /> {t("cv.upload")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setWorking(normalizeCV(cv?.data ?? EMPTY_CV));
                setEditorTitle(cv ? t("cv.edit") : t("cv.create"));
                setSummary(cv ? "Edited manually" : "Created in Wasl");
                setEditorOpen(true);
              }}
            >
              {cv ? <PenLine /> : <FilePlus2 />} {cv ? t("cv.edit") : t("cv.create")}
            </Button>
          </>
        }
      />
      {parsing && <AiWorking steps={locale === "ar" ? ["قراءة الملف", "تنقية", "هيكلة السيرة"] : ["read file", "sanitize", "structure CV"]} />}
      <ErrorNote error={uploadErr} />

      {!!suggestions.data?.length && cv && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-hand text-3xl">
            {t("cv.suggestions")} <Badge tone="warn">{suggestions.data.length}</Badge>
          </h2>
          <div className="flex flex-col gap-6">
            {suggestions.data.map((s) => (
              <SuggestionCard key={s.id} s={s} master={cv.data} onDone={reloadAll} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {master.loading && !cv && <Loading />}
          <ErrorNote error={master.error} onRetry={master.reload} />
          {!master.loading && !cv && <EmptyState title={t("cv.empty")} />}
          {cv && (
            <Card className="flex flex-col gap-4">
              <CardTitle action={<ExportButtons cv={cv} />}>
                {t("cv.current")} <Badge tone="brand">v{cv.version}</Badge>
              </CardTitle>
              <CVView data={cv.data} />
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardTitle icon={<History />}>{t("cv.history")}</CardTitle>
            {!versions.data?.length ? (
              <p className="text-sm text-ink-soft">{t("common.none")}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {versions.data.map((v) => (
                  <li key={v.version}>
                    <button onClick={() => openVersion(v.version)} className="sketch-soft flex w-full items-start gap-3 p-3 text-start hover:bg-paper-2">
                      <Badge tone={v.version === cv?.version ? "brand" : "neutral"}>v{v.version}</Badge>
                      <span className="flex-1 text-sm">
                        {v.change_summary}
                        <span className="block text-xs text-ink-faint">{fmtDate(v.created_at, locale)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card>
            <CardTitle>{t("cv.tailored")}</CardTitle>
            {!tailored.data?.length ? (
              <p className="text-sm text-ink-soft">{t("common.none")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {tailored.data.map((c) => (
                  <li key={c.id} className="sketch-soft flex flex-col gap-2 p-3">
                    <div className="text-sm font-bold">{c.title}</div>
                    <div className="text-xs text-ink-faint">{fmtDate(c.created_at, locale)}</div>
                    <div className="flex flex-wrap gap-2">
                      <ExportButtons cv={c} />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t("common.delete")}
                        onClick={async () => {
                          await api(`/api/cv/tailored/${c.id}`, { method: "DELETE" });
                          tailored.reload();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent title={editorTitle} description={cv ? `v${cv.version} → v${cv.version + 1}` : undefined} wide>
          <CVEditor value={working} onChange={setWorking} />
          <div className="sticky bottom-0 mt-5 flex justify-end gap-2 bg-paper pt-3">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveMaster} loading={saving}>
              <Check /> {t("cv.review.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewVersion} onOpenChange={(o) => !o && setViewVersion(null)}>
        <DialogContent title={`v${viewVersion?.version}`} wide>
          {viewVersion && <CVView data={viewVersion.data} />}
          <div className="mt-4 flex justify-end">
            {viewVersion && viewVersion.version !== cv?.version && (
              <Button variant="secondary" onClick={() => restore(viewVersion.version)}>
                <RotateCcw /> {t("cv.restore")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
