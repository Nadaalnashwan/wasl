"use client";

import { Download, FileText, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError, download } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Analysis, CV } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

/** Compact list of past analyses (gap or tailor). */
export function AnalysisHistory({
  items,
  activeId,
  onOpen,
  emptyText,
}: {
  items: Analysis[];
  activeId?: string | null;
  onOpen: (a: Analysis) => void;
  emptyText: string;
}) {
  const { locale } = useI18n();
  if (!items.length) return <p className="text-sm text-fg-3">{emptyText}</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {items.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() => onOpen(h)}
            aria-current={activeId === h.id ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start hover:bg-surface-2",
              activeId === h.id && "bg-primary-soft hover:bg-primary-soft",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg" dir="auto">
                {h.job_title || "—"}
              </span>
              <span className="block truncate text-xs text-fg-3" dir="auto">
                {[h.company, fmtDate(h.created_at, locale)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {h.match_score != null && <span className="num shrink-0 text-sm font-semibold text-fg-2">{h.match_score}%</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Row = { key: string; analysis?: Analysis; cv?: CV };

/** Previous tailoring runs joined with their tailored CV copies: open, export, delete. */
export function TailorHistory({
  analyses,
  tailored,
  activeId,
  onOpen,
  onDeleted,
}: {
  analyses: Analysis[];
  tailored: CV[];
  activeId?: string | null;
  onOpen: (analysisId: string) => void;
  onDeleted: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [target, setTarget] = React.useState<CV | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);

  const byAnalysis = new Map(tailored.filter((c) => c.job_analysis_id).map((c) => [c.job_analysis_id as string, c]));
  const rows: Row[] = analyses.map((a) => ({ key: a.id, analysis: a, cv: byAnalysis.get(a.id) }));
  const seen = new Set(analyses.map((a) => a.id));
  for (const c of tailored) if (!c.job_analysis_id || !seen.has(c.job_analysis_id)) rows.push({ key: c.id, cv: c });

  async function exp(c: CV, fmt: "pdf" | "docx") {
    setExporting(c.id + fmt);
    try {
      await download(`/api/cv/${c.id}/export?format=${fmt}`, `wasl_cv_tailored.${fmt}`);
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setExporting(null);
    }
  }

  async function del() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/cv/tailored/${target.id}`, { method: "DELETE" });
      toast("info", t("cv2.tailored.deleted"));
      setTarget(null);
      onDeleted();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) return <p className="text-sm text-fg-3">{t("career2.hist.tailorNone")}</p>;

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const title = r.analysis ? [r.analysis.job_title || "—", r.analysis.company].filter(Boolean).join(" · ") : r.cv?.title || "—";
          const date = r.analysis?.created_at ?? r.cv?.created_at;
          const openId = r.analysis?.id ?? r.cv?.job_analysis_id ?? null;
          const active = !!openId && openId === activeId;
          return (
            <li key={r.key} className={cn("flex flex-col gap-2 py-3", active && "-mx-2 rounded-lg bg-primary-soft px-2")}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg" dir="auto">
                    {title}
                  </div>
                  <div className="num text-xs text-fg-3">
                    {fmtDate(date, locale)}
                    {!r.cv && <> · {t("career2.hist.cvDeleted")}</>}
                  </div>
                </div>
                {r.analysis?.match_score != null && <span className="num shrink-0 text-sm font-semibold text-fg-2">{r.analysis.match_score}%</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {openId && (
                  <Button size="xs" variant={active ? "subtle" : "ghost"} onClick={() => onOpen(openId)} aria-current={active ? "true" : undefined}>
                    <FileText /> {active ? t("career2.hist.opened") : t("cv2.tailored.open")}
                  </Button>
                )}
                {r.cv && (
                  <>
                    {(["pdf", "docx"] as const).map((f) => (
                      <Button
                        key={f}
                        size="xs"
                        variant="ghost"
                        loading={exporting === r.cv!.id + f}
                        onClick={() => exp(r.cv!, f)}
                        aria-label={`${f.toUpperCase()}: ${r.cv!.title}`}
                      >
                        {exporting !== r.cv!.id + f && <Download />} {f.toUpperCase()}
                      </Button>
                    ))}
                    <Button size="icon-sm" variant="ghost" className="ms-auto" aria-label={`${t("common.delete")}: ${r.cv.title}`} onClick={() => setTarget(r.cv!)}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t("cv2.tailored.deleteTitle")}
        description={target ? t("cv2.tailored.deleteDesc").replace("{title}", target.title) : undefined}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={busy}
        onConfirm={del}
      />
    </>
  );
}
