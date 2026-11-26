"use client";

import { AlertTriangle, ArrowDownUp, Ban, CheckCircle2, ShieldCheck } from "lucide-react";
import * as React from "react";
import { type ClaimReport, ClaimReportPanel } from "@/components/claims";
import { CVDocument, type DocMarks } from "@/components/cv/document";
import { normalizeCV } from "@/components/cv/model";
import { Notice } from "@/components/feedback";
import { MetricRow, Stat } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";
import type { CVData } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Enforcement = {
  claims_checked?: number;
  unsupported_found?: number;
  rejected_bullets?: number;
  accepted_bullets?: number;
  kept_original?: { field: string; unsupported?: { type: string; value: string }[] }[];
  unknown_ids?: string[];
  unsupported_rate_before_enforcement?: number;
  claim_report?: ClaimReport | null;
};

type ItemDiff = { section: "experience" | "projects"; id: string; title: string; before: string[]; after: string[]; added: string[]; removed: string[] };

export type TailorDiff = {
  summaryChanged: boolean;
  items: ItemDiff[];
  movedUp: { section: "experience" | "projects"; title: string }[];
  skillsAdded: string[];
  skillsRemoved: string[];
  skillsReordered: boolean;
  skillCount: number;
};

const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Real, field-level comparison between the source CV and the tailored copy. */
export function computeTailorDiff(originalData: CVData, tailoredData: CVData): TailorDiff {
  const o = normalizeCV(originalData);
  const t = normalizeCV(tailoredData);
  const items: ItemDiff[] = [];
  const movedUp: TailorDiff["movedUp"] = [];
  for (const section of ["experience", "projects"] as const) {
    const before = o[section] as { id: string; bullets: string[]; title?: string; name?: string }[];
    const after = t[section] as { id: string; bullets: string[]; title?: string; name?: string }[];
    const byId = new Map(before.map((x, i) => [x.id, { x, i }]));
    after.forEach((it, i) => {
      const prev = byId.get(it.id);
      if (!prev) return;
      const title = (section === "experience" ? it.title : it.name) || "—";
      const added = it.bullets.filter((b) => !prev.x.bullets.map(norm).includes(norm(b)));
      const removed = prev.x.bullets.filter((b) => !it.bullets.map(norm).includes(norm(b)));
      if (added.length || removed.length) items.push({ section, id: it.id, title, before: prev.x.bullets, after: it.bullets, added, removed });
      if (i < prev.i) movedUp.push({ section, title });
    });
  }
  const lo = new Set(o.skills.map((s) => s.toLowerCase()));
  const lt = new Set(t.skills.map((s) => s.toLowerCase()));
  const skillsAdded = t.skills.filter((s) => !lo.has(s.toLowerCase()));
  const skillsRemoved = o.skills.filter((s) => !lt.has(s.toLowerCase()));
  const skillsReordered = !skillsAdded.length && !skillsRemoved.length && o.skills.join("\n") !== t.skills.join("\n");
  return {
    summaryChanged: norm(o.summary) !== norm(t.summary),
    items,
    movedUp,
    skillsAdded,
    skillsRemoved,
    skillsReordered,
    skillCount: t.skills.length,
  };
}

function BulletDiff({ d }: { d: ItemDiff }) {
  const { t } = useI18n();
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="mb-2 text-sm font-medium text-fg" dir="auto">
        {d.title}
        <span className="ms-2 text-xs font-normal text-fg-3">{d.section === "experience" ? t("cv.section.experience") : t("cv.section.projects")}</span>
      </div>
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
        <div className="bg-surface-2/60 p-3">
          <div className="eyebrow mb-1.5">{t("tailor.original")}</div>
          <ul className="list-disc space-y-1 ps-4 text-[13px] leading-relaxed marker:text-fg-3" dir="auto">
            {d.before.map((b, i) => {
              const gone = d.removed.includes(b);
              return (
                <li key={i} className={cn(gone ? "text-fg-3 line-through decoration-bad/50" : "text-fg-2")}>
                  {gone && <span className="sr-only">{t("cv2.doc.replaced")}: </span>}
                  {b}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="bg-surface p-3">
          <div className="eyebrow mb-1.5">{t("tailor.tailored")}</div>
          <ul className="list-disc space-y-1 ps-4 text-[13px] leading-relaxed marker:text-fg-3" dir="auto">
            {d.after.map((b, i) =>
              d.added.includes(b) ? (
                <li key={i}>
                  <mark className="rounded-sm bg-primary-soft px-0.5 text-fg">
                    <span className="sr-only">{t("cv2.doc.changed")}: </span>
                    {b}
                  </mark>
                </li>
              ) : (
                <li key={i} className="text-fg-2">
                  {b}
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </li>
  );
}

/** Step 4: what changed, all of it re-checked against your evidence. */
export function SupportedChanges({
  diff,
  original,
  tailored,
  enforcement,
  notes,
  highlightedIds,
}: {
  diff: TailorDiff;
  original: CVData | null;
  tailored: CVData;
  enforcement?: Enforcement;
  notes?: string[];
  highlightedIds?: string[];
}) {
  const { t } = useI18n();
  const e = enforcement ?? {};
  const o = original ? normalizeCV(original) : null;
  const tl = normalizeCV(tailored);
  const relevant = (highlightedIds ?? [])
    .map((id) => [...tl.experience.map((x) => ({ id: x.id, title: x.title })), ...tl.projects.map((x) => ({ id: x.id, title: x.name }))].find((x) => x.id === id)?.title)
    .filter((x): x is string => !!x);
  const nothing = !diff.summaryChanged && !diff.items.length && !diff.movedUp.length && !diff.skillsReordered;
  return (
    <div className="flex flex-col gap-8">
      <MetricRow>
        <Stat label={t("career2.enf.accepted")} value={e.accepted_bullets ?? 0} hint={t("career2.enf.acceptedHint")} />
        <Stat label={t("career2.enf.rejected")} value={e.rejected_bullets ?? 0} hint={t("career2.enf.rejectedHint")} />
        <Stat label={t("career2.enf.checked")} value={e.claims_checked ?? 0} />
        <Stat label={t("career2.enf.unsupported")} value={e.unsupported_found ?? 0} hint={t("career2.enf.unsupportedHint")} />
      </MetricRow>

      {nothing && <p className="text-sm text-fg-3">{t("career2.chg.nothing")}</p>}

      {diff.summaryChanged && o && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">{t("career2.chg.summary")}</h3>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            <div className="bg-surface-2/60 p-3 text-[13px] leading-relaxed text-fg-3" dir="auto">
              <div className="eyebrow mb-1.5">{t("tailor.original")}</div>
              {o.summary || "—"}
            </div>
            <div className="bg-surface p-3 text-[13px] leading-relaxed" dir="auto">
              <div className="eyebrow mb-1.5">{t("tailor.tailored")}</div>
              <mark className="rounded-sm bg-primary-soft px-0.5 text-fg">{tl.summary}</mark>
            </div>
          </div>
        </section>
      )}

      {diff.items.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-fg">{t("career2.chg.bullets")}</h3>
          <p className="mb-3 text-xs text-fg-3">{t("career2.chg.bulletsHint")}</p>
          <ul className="divide-y divide-border">
            {diff.items.map((d) => (
              <BulletDiff key={d.section + d.id} d={d} />
            ))}
          </ul>
        </section>
      )}

      {(diff.movedUp.length > 0 || diff.skillsReordered || diff.skillsAdded.length > 0 || relevant.length > 0) && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-fg">{t("career2.chg.order")}</h3>
          {diff.movedUp.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-fg-2">
              <ArrowDownUp className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
              <span>
                {t("career2.chg.moved")} <span className="text-fg">{diff.movedUp.map((m) => m.title).join(", ")}</span>
              </span>
            </p>
          )}
          {relevant.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-fg-2">
              <ArrowDownUp className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
              <span>
                {t("career2.chg.relevant")} <span className="text-fg">{relevant.join(", ")}</span>
              </span>
            </p>
          )}
          {diff.skillsReordered && (
            <p className="flex items-start gap-2 text-sm text-fg-2">
              <ArrowDownUp className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
              {fill(t("career2.chg.skills"), { n: diff.skillCount })}
            </p>
          )}
          {diff.skillsAdded.length > 0 && (
            <Notice tone="bad" icon={<AlertTriangle />} title={t("career2.chg.skillsAddedTitle")}>
              {diff.skillsAdded.join(", ")}
            </Notice>
          )}
        </section>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-surface-2/70 px-3 py-2.5 text-xs leading-relaxed text-fg-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        {t("career2.chg.neverAdds")}
      </p>

      {notes && notes.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-fg">{t("career2.chg.notes")}</h3>
          <p className="mb-2 text-xs text-fg-3">{t("career2.chg.notesHint")}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm text-fg-2 marker:text-fg-3">
            {notes.map((n, i) => (
              <li key={i} dir="auto">
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** What the honesty guard blocked, and why. Shown honestly even when empty. */
export function BlockedChanges({ enforcement, original }: { enforcement?: Enforcement; original: CVData | null }) {
  const { t } = useI18n();
  const e = enforcement ?? {};
  const o = original ? normalizeCV(original) : null;
  const kept = e.kept_original ?? [];
  const unknown = e.unknown_ids ?? [];
  const label = (field: string) => {
    if (field === "summary") return t("cv.section.summary");
    const [sec, id] = field.split(":");
    const list = o ? ((sec === "projects" ? o.projects : o.experience) as { id: string; title?: string; name?: string }[]) : [];
    const it = list.find((x) => x.id === id);
    return it ? it.title || it.name || id : id;
  };
  const clean = !e.rejected_bullets && !kept.length && !unknown.length;
  return (
    <div className="flex flex-col gap-4">
      {clean ? (
        <p className="flex items-center gap-2 text-sm text-fg-2">
          <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />
          {t("career2.blk.none")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-sm">
          {(e.rejected_bullets ?? 0) > 0 && (
            <li className="flex gap-3 px-4 py-3 text-sm">
              <Ban className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
              <div>
                <div className="font-medium text-fg">{fill(t("career2.blk.rejected"), { n: e.rejected_bullets ?? 0 })}</div>
                <p className="text-xs text-fg-3">{t("career2.blk.rejectedHint")}</p>
              </div>
            </li>
          )}
          {kept.map((k, i) => (
            <li key={i} className="flex gap-3 px-4 py-3 text-sm">
              <Ban className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div className="min-w-0">
                <div className="font-medium text-fg" dir="auto">
                  {fill(t("career2.blk.kept"), { item: label(k.field) })}
                </div>
                <p className="text-xs text-fg-3">{k.field === "summary" ? t("career2.blk.keptSummary") : t("career2.blk.keptItem")}</p>
                {k.unsupported && k.unsupported.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {k.unsupported.map((u, j) => (
                      <li key={j} className="rounded bg-bad-soft px-1.5 py-0.5 text-[11px] text-bad" dir="auto">
                        {u.value}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
          {unknown.length > 0 && (
            <li className="flex gap-3 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              <div className="min-w-0">
                <div className="font-medium text-fg">{fill(t("career2.blk.unknown"), { n: unknown.length })}</div>
                <p className="text-xs text-fg-3">{t("career2.blk.unknownHint")}</p>
                <p className="mt-1 font-mono text-[11px] break-all text-fg-3">{unknown.join(", ")}</p>
              </div>
            </li>
          )}
        </ul>
      )}
      {e.claim_report && <ClaimReportPanel report={e.claim_report} showSupported />}
    </div>
  );
}

/** Step 5: original vs tailored documents with the differences marked. */
export function SideBySide({ original, tailored, diff, reopened }: { original: CVData | null; tailored: CVData; diff: TailorDiff; reopened?: boolean }) {
  const { t } = useI18n();
  const [view, setView] = React.useState<"original" | "tailored">("tailored");
  const tMarks: DocMarks = {
    tone: "change",
    changedIds: new Set(diff.items.map((d) => d.id)),
    bullets: new Set(diff.items.flatMap((d) => d.added)),
    summary: diff.summaryChanged,
  };
  const oMarks: DocMarks = { tone: "change", struckBullets: new Set(diff.items.flatMap((d) => d.removed)) };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-primary-soft" aria-hidden /> {t("career2.cmp.legendChanged")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="text-fg-3 line-through decoration-bad/60" aria-hidden>
            abc
          </span>{" "}
          {t("career2.cmp.legendReplaced")}
        </span>
      </div>
      {reopened && original && <Notice tone="info">{t("career2.cmp.reopened")}</Notice>}
      {!original && <Notice tone="warn">{t("career2.cmp.noOriginal")}</Notice>}
      {original && (
        <Segmented
          className="lg:hidden"
          ariaLabel={t("career2.cmp.view")}
          value={view}
          onChange={setView}
          options={[
            { value: "original", label: t("tailor.original") },
            { value: "tailored", label: t("tailor.tailored") },
          ]}
        />
      )}
      <div className={cn("grid gap-6", original && "lg:grid-cols-2")}>
        {original && (
          <div className={cn("min-w-0", view !== "original" && "hidden lg:block")}>
            <div className="mb-2 text-xs font-semibold text-fg-3">{t("tailor.original")}</div>
            <CVDocument data={original} marks={oMarks} compact label={t("tailor.original")} />
          </div>
        )}
        <div className={cn("min-w-0", original && view !== "tailored" && "hidden lg:block")}>
          <div className="mb-2 text-xs font-semibold text-primary-text">{t("tailor.tailored")}</div>
          <CVDocument data={tailored} marks={tMarks} compact label={t("tailor.tailored")} />
        </div>
      </div>
    </div>
  );
}
