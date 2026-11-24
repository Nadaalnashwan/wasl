"use client";

import { Download, Eye, RotateCcw, ScanSearch, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError, download } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { CV } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

export type Version = { version: number; change_summary: string; created_at: string };

/** PDF / DOCX export of a saved CV (master or tailored). */
export function ExportButtons({ cv, size = "sm", label }: { cv: Pick<CV, "id">; size?: "xs" | "sm"; label?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = React.useState<"pdf" | "docx" | null>(null);
  const go = async (fmt: "pdf" | "docx") => {
    setBusy(fmt);
    try {
      await download(`/api/cv/${cv.id}/export?format=${fmt}`, `wasl_cv.${fmt}`);
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label ?? t("cv2.export.label")}>
      <Button size={size} variant="outline" onClick={() => go("pdf")} loading={busy === "pdf"}>
        {busy !== "pdf" && <Download />} {t("cv.export.pdf")}
      </Button>
      <Button size={size} variant="outline" onClick={() => go("docx")} loading={busy === "docx"}>
        {busy !== "docx" && <Download />} {t("cv.export.docx")}
      </Button>
    </div>
  );
}

/** Master CV version history (newest first): view in the preview, restore with confirmation. */
export function VersionList({
  versions,
  current,
  viewing,
  onView,
  onRestore,
}: {
  versions: Version[];
  current?: number;
  viewing?: number | null;
  onView: (v: number) => void;
  onRestore: (v: number) => void;
}) {
  const { t, locale } = useI18n();
  if (!versions.length) return <p className="text-sm text-fg-3">{t("cv2.hist.none")}</p>;
  return (
    <ol className="relative flex flex-col">
      {versions.map((v, i) => {
        const isCurrent = v.version === current;
        return (
          <li key={v.version} className={cn("relative flex gap-3 ps-1", i < versions.length - 1 && "pb-4")}>
            {i < versions.length - 1 && <span aria-hidden className="absolute start-[13px] top-7 bottom-0 w-px bg-border" />}
            <span
              aria-hidden
              className={cn(
                "num relative mt-0.5 grid h-6 min-w-6 place-items-center rounded-md border px-1 text-[11px] font-semibold",
                isCurrent ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-fg-2",
              )}
            >
              {v.version}
            </span>
            <div className={cn("min-w-0 flex-1 rounded-lg px-2 py-0.5", viewing === v.version && "bg-primary-soft")}>
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-sm font-medium text-fg">
                  <span className="sr-only">{t("cv2.hist.version")} </span>v{v.version}
                </span>
                {isCurrent && <Status tone="brand">{t("cv2.hist.current")}</Status>}
                <span className="num ms-auto text-xs text-fg-3">{fmtDate(v.created_at, locale)}</span>
              </div>
              <p className="mt-0.5 text-sm break-words text-fg-2">{v.change_summary || "—"}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Button size="xs" variant="ghost" onClick={() => onView(v.version)} aria-pressed={viewing === v.version}>
                  <Eye /> {t("cv2.hist.view")}
                </Button>
                {!isCurrent && (
                  <Button size="xs" variant="ghost" onClick={() => onRestore(v.version)}>
                    <RotateCcw /> {t("cv.restore")}
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Tailored CVs (copies made by /tailor). Export, open in Tailor, delete with confirmation. */
export function TailoredList({ items, onDeleted, showOpen = true }: { items: CV[]; onDeleted: () => void; showOpen?: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [target, setTarget] = React.useState<CV | null>(null);
  const [busy, setBusy] = React.useState(false);

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

  if (!items.length) return <p className="text-sm text-fg-3">{t("cv2.tailored.none")}</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="min-w-0 flex-1 basis-48">
              <div className="truncate text-sm font-medium text-fg" dir="auto">
                {c.title}
              </div>
              <div className="num text-xs text-fg-3">{fmtDate(c.created_at, locale)}</div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {showOpen && c.job_analysis_id && (
                <Button asChild size="xs" variant="ghost">
                  <Link href={`/tailor?analysis=${encodeURIComponent(c.job_analysis_id)}`}>
                    <ScanSearch /> {t("cv2.tailored.open")}
                  </Link>
                </Button>
              )}
              <ExportButtons cv={c} size="xs" label={`${t("cv2.export.label")}: ${c.title}`} />
              <Button size="icon-sm" variant="ghost" aria-label={`${t("common.delete")}: ${c.title}`} onClick={() => setTarget(c)}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
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
