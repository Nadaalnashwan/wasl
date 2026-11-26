"use client";

import { ExternalLink, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorNote, SkeletonRows } from "@/components/feedback";
import { scoreText } from "@/components/jobs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Segmented, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { SavedJob, TrackStatus } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";
import { STATUSES } from "./detail";

type Changed = { id: string; listing_id: string | null; status: TrackStatus | null };

function NotesField({ row, onSave, className }: { row: SavedJob; onSave: (notes: string) => void; className?: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState<string | null>(null);
  return (
    <Textarea
      aria-label={`${t("jobs.track.notes")} — ${row.job.title}`}
      className={cn("min-h-9 py-1.5 text-sm", className)}
      rows={1}
      maxLength={2000}
      dir="auto"
      placeholder={t("jobs2.track.notes.ph")}
      value={value ?? row.notes}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== null && value !== row.notes) onSave(value);
      }}
    />
  );
}

function StatusSelect({ row, onChange }: { row: SavedJob; onChange: (s: TrackStatus) => void }) {
  const { t } = useI18n();
  return (
    <Select
      aria-label={`${t("jobs2.track.col.status")} — ${row.job.title}`}
      className="h-8 w-auto min-w-32 text-sm"
      value={row.status}
      onChange={(e) => onChange(e.target.value as TrackStatus)}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(`track.${s}` as TKey)}
        </option>
      ))}
    </Select>
  );
}

function RowActions({ row, onRemove, compact }: { row: SavedJob; onRemove: () => void; compact?: boolean }) {
  const { t } = useI18n();
  const label = (text: string) => (compact ? <span className="sr-only">{text}</span> : text);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {row.job.apply_url && !row.expired && (
        <Button asChild size={compact ? "icon-sm" : "xs"} variant="ghost" title={compact ? t("jobs.apply") : undefined}>
          <a href={row.job.apply_url} target="_blank" rel="noopener noreferrer nofollow">
            <ExternalLink className="rtl:-scale-x-100" />
            {label(t("jobs.apply"))}
            <span className="sr-only">{t("jobs2.detail.newtab")}</span>
          </a>
        </Button>
      )}
      {row.listing_id && !row.expired && (
        <Button asChild size={compact ? "icon-sm" : "xs"} variant="ghost" title={compact ? t("jobs.tailor") : undefined}>
          <Link href={`/tailor?job=${row.listing_id}`}>
            <FileText />
            {label(t("jobs.tailor"))}
          </Link>
        </Button>
      )}
      <Button
        size={compact ? "icon-sm" : "xs"}
        variant="ghost"
        onClick={onRemove}
        title={compact ? t("jobs.track.remove") : undefined}
        aria-label={`${t("jobs.track.remove")} — ${row.job.title}`}
      >
        <Trash2 />
        {!compact && t("jobs.track.remove")}
      </Button>
    </div>
  );
}

function JobCell({ row }: { row: SavedJob }) {
  const { t, locale } = useI18n();
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium break-words text-fg" dir="auto">
        {row.job.title}
      </div>
      <div className="text-xs text-fg-2" dir="auto">
        {row.job.company || "—"} · {row.job.city || t("jobs.city.Other")}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {row.expired && <Badge tone="warn">{t("jobs.track.expired")}</Badge>}
        {row.applied_at && (
          <span className="text-xs text-fg-3">
            {t("jobs.track.applied_on")}: {fmtDate(row.applied_at, locale)}
          </span>
        )}
        <span className="text-xs text-fg-3">
          {t("jobs2.track.col.updated")}: {fmtDate(row.updated_at, locale)}
        </span>
      </div>
    </div>
  );
}

export function Tracker({
  rows,
  loading,
  error,
  reload,
  onChanged,
}: {
  rows: SavedJob[] | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  onChanged: (row: Changed) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [filter, setFilter] = useState<TrackStatus | "all">("all");
  const [removing, setRemoving] = useState<SavedJob | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(row: SavedJob, body: Partial<Pick<SavedJob, "status" | "notes">>) {
    try {
      const r = await api<SavedJob>(`/api/jobs/saved/${row.id}`, { method: "PATCH", json: body });
      if (body.status) onChanged({ id: r.id, listing_id: r.listing_id, status: r.status });
      if (body.notes !== undefined) toast("ok", t("jobs2.track.notes.saved"));
      reload();
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  async function remove(row: SavedJob) {
    setBusy(true);
    try {
      await api(`/api/jobs/saved/${row.id}`, { method: "DELETE" });
      onChanged({ id: row.id, listing_id: row.listing_id, status: null });
      toast("ok", t("jobs.toast.removed"));
      setRemoving(null);
      reload();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (loading && !rows) return <SkeletonRows rows={3} />;
  if (!rows?.length) return <EmptyState title={t("jobs.track.empty")} text={t("jobs.track.empty.d")} />;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])) as Record<TrackStatus, number>;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented
          size="sm"
          ariaLabel={t("jobs2.track.filter")}
          value={filter}
          onChange={setFilter}
          className="flex-nowrap"
          options={[
            { value: "all" as const, label: `${t("jobs2.track.all")} · ${rows.length}` },
            ...STATUSES.map((s) => ({ value: s, label: `${t(`track.${s}` as TKey)} · ${counts[s]}` })),
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="border-s-2 border-border py-1 ps-4 text-sm text-fg-3">{t("jobs2.track.nofilter")}</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden ink-soft lg:block">
            <table className="w-full table-fixed text-start text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs text-fg-3">
                <tr>
                  <th scope="col" className="w-[34%] px-4 py-2.5 text-start font-medium">
                    {t("jobs2.track.col.job")}
                  </th>
                  <th scope="col" className="w-40 px-3 py-2.5 text-start font-medium">
                    {t("jobs2.track.col.status")}
                  </th>
                  <th scope="col" className="w-16 px-3 py-2.5 text-end font-medium">
                    {t("jobs2.track.col.match")}
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">
                    {t("jobs.track.notes")}
                  </th>
                  <th scope="col" className="w-32 px-3 py-2.5 text-start font-medium">
                    <span className="sr-only">{t("jobs2.track.col.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <JobCell row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusSelect row={row} onChange={(s) => patch(row, { status: s })} />
                    </td>
                    <td className="num px-3 py-3 text-end">
                      {row.match_score !== null ? (
                        <span className={cn("font-semibold", scoreText(Math.round(row.match_score)))}>{Math.round(row.match_score)}%</span>
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <NotesField row={row} onSave={(notes) => patch(row, { notes })} />
                    </td>
                    <td className="px-3 py-3">
                      <RowActions compact row={row} onRemove={() => setRemoving(row)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked list */}
          <ul className="divide-y divide-border ink-soft lg:hidden">
            {shown.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start gap-3">
                  <JobCell row={row} />
                  {row.match_score !== null && (
                    <span className={cn("num ms-auto shrink-0 text-sm font-semibold", scoreText(Math.round(row.match_score)))}>{Math.round(row.match_score)}%</span>
                  )}
                </div>
                <StatusSelect row={row} onChange={(s) => patch(row, { status: s })} />
                <NotesField row={row} onSave={(notes) => patch(row, { notes })} />
                <RowActions row={row} onRemove={() => setRemoving(row)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("jobs2.track.remove.title")}
        description={removing ? `${removing.job.title} · ${removing.job.company}` : undefined}
        confirmLabel={t("jobs.track.remove")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => removing && remove(removing)}
        loading={busy}
        destructive
      >
        <p className="text-sm text-fg-2">{t("jobs2.track.remove.d")}</p>
      </ConfirmDialog>
    </div>
  );
}
