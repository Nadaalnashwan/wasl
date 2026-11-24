"use client";

import { AlertTriangle, Check, Eye, PenLine, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { type ClaimReport, ClaimReportPanel, ClaimSummary } from "@/components/claims";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Status } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Change, CV, CVData, Suggestion } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { CVDocument, type DocMarks } from "./document";
import { CVEditor, sectionTitleKey } from "./editor";
import { changedSections, cleanCV, findItem, itemHeading, type ListKey, normalizeCV, type SectionKey } from "./model";

/** Suggestion change as stored by the backend; `claim_check` is optional (claims-v2 report). */
export type SuggestionChange = Change & { claim_check?: ClaimReport | null; achievement_id?: string };

export function suggestionMarks(s: Suggestion): DocMarks {
  const changes = s.changes as SuggestionChange[];
  return {
    tone: "add",
    addedIds: new Set(changes.filter((c) => c.action === "add_item" && c.item_id).map((c) => c.item_id as string)),
    bullets: new Set(changes.map((c) => c.bullet).filter(Boolean) as string[]),
    skills: new Set(changes.flatMap((c) => c.skills ?? [])),
  };
}

const ACTION_LABEL: Record<string, TKey> = {
  add_item: "cv2.sug.action.add_item",
  add_bullet: "cv2.sug.action.add_bullet",
  add_skills: "cv2.sug.action.add_skills",
};

function MiniItem({
  section,
  item,
  added,
  newBullet,
}: {
  section: ListKey;
  item: Record<string, unknown>;
  added?: boolean;
  newBullet?: string;
}) {
  const { t } = useI18n();
  const head = itemHeading(section, item);
  const bullets = Array.isArray(item.bullets) ? (item.bullets as string[]) : [];
  const desc = typeof item.description === "string" ? item.description : typeof item.details === "string" ? item.details : "";
  return (
    <div className={cn("text-[13px] leading-relaxed", added && "rounded-md border-s-2 border-ok bg-ok-soft/70 px-2 py-1.5")}>
      <div className="font-medium text-fg">
        {added && <span className="sr-only">{t("cv2.doc.added")}: </span>}
        {head.title || "—"}
        {head.sub && <span className="font-normal text-fg-3"> · {head.sub}</span>}
      </div>
      {desc && <p className="text-fg-2">{desc}</p>}
      {bullets.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 ps-4 marker:text-fg-3">
          {bullets.map((b, i) => (
            <li key={i} className="text-fg-2">
              {newBullet && b === newBullet ? (
                <mark className="rounded-sm bg-ok-soft px-0.5 text-fg">
                  <span className="sr-only">{t("cv2.doc.added")}: </span>
                  {b}
                </mark>
              ) : (
                b
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Skills({ list, added }: { list: string[]; added?: Set<string> }) {
  const { t } = useI18n();
  if (!list.length) return <p className="text-[13px] text-fg-3">{t("cv2.sug.noSkills")}</p>;
  return (
    <ul className="flex flex-wrap gap-1">
      {list.map((s) => (
        <li key={s}>
          <Badge tone={added?.has(s) ? "ok" : "neutral"}>
            {added?.has(s) && <span className="sr-only">{t("cv2.doc.added")}: </span>}
            {added?.has(s) ? `+ ${s}` : s}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** One proposed change, shown as BEFORE (current Master CV) vs AFTER (the draft). */
export function ChangeDiff({ change, master, draft }: { change: SuggestionChange; master: CVData; draft: CVData }) {
  const { t } = useI18n();
  const section = change.section as SectionKey;
  const sectionLabel = sectionTitleKey(section) ? t(sectionTitleKey(section)) : change.section;
  const actionKey = ACTION_LABEL[change.action];

  let before: React.ReactNode = <p className="text-[13px] text-fg-3">{t("cv2.sug.notInCv")}</p>;
  let after: React.ReactNode = <p className="text-[13px] text-fg-2">{change.summary}</p>;

  if (change.action === "add_item") {
    const d = findItem(draft, change.item_id);
    if (d) after = <MiniItem section={d.section} item={d.item} added />;
  } else if (change.action === "add_bullet") {
    const m = findItem(master, change.item_id);
    const d = findItem(draft, change.item_id);
    if (m) before = <MiniItem section={m.section} item={m.item} />;
    if (d) after = <MiniItem section={d.section} item={d.item} newBullet={change.bullet} />;
  } else if (change.action === "add_skills") {
    const added = new Set(change.skills ?? []);
    before = <Skills list={master.skills} />;
    after = <Skills list={[...master.skills, ...(change.skills ?? []).filter((s) => !master.skills.includes(s))]} added={added} />;
  }

  return (
    <li className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">{sectionLabel}</Badge>
        <span className="text-sm font-medium text-fg">{actionKey ? t(actionKey) : change.action}</span>
        {change.claim_check && <ClaimSummary report={change.claim_check} className="ms-auto" />}
      </div>
      <p className="text-sm text-fg-2">{change.summary}</p>
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <div className="bg-surface-2/60 p-3">
          <div className="eyebrow mb-1.5">{t("cv2.sug.before")}</div>
          {before}
        </div>
        <div className="bg-surface p-3">
          <div className="eyebrow mb-1.5">{t("cv2.sug.after")}</div>
          {after}
        </div>
      </div>
      {change.reason && (
        <p className="text-xs text-fg-3">
          <span className="font-medium text-fg-2">{t("cv2.sug.why")}</span> {change.reason}
        </p>
      )}
      {change.claim_check && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-primary-text">{t("cv2.sug.claimDetails")}</summary>
          <ClaimReportPanel report={change.claim_check} className="mt-2" showSupported />
        </details>
      )}
    </li>
  );
}

/** Review card for one pending suggestion: before/after per change, then Accept / Edit then accept / Reject. */
export function SuggestionReview({
  s,
  master,
  previewing,
  onPreview,
  guard,
  onResolved,
}: {
  s: Suggestion;
  master: CV;
  previewing: boolean;
  onPreview: () => void;
  /** Runs the action only after the page has dealt with unsaved edits. */
  guard: (run: () => void) => void;
  onResolved: (kind: "accepted" | "rejected" | "stale", message?: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = React.useState<"accept" | "edit" | "reject" | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const [draft, setDraft] = React.useState<CVData>(() => normalizeCV(s.draft_data));
  const outdated = s.base_version !== master.version;
  const changes = s.changes as SuggestionChange[];
  const cur = normalizeCV(master.data);
  const draftData = normalizeCV(s.draft_data);
  const editedSections = changedSections(cur, draft);

  async function act(kind: "accept" | "reject" | "edit") {
    setBusy(kind);
    try {
      if (kind === "edit") await api(`/api/cv/suggestions/${s.id}/edit`, { method: "POST", json: { draft_data: cleanCV(draft) } });
      else await api(`/api/cv/suggestions/${s.id}/${kind}`, { method: "POST" });
      setEditing(false);
      setConfirmReject(false);
      toast(kind === "reject" ? "info" : "ok", kind === "reject" ? t("cv2.sug.rejectedToast") : t("cv2.sug.acceptedToast"));
      onResolved(kind === "reject" ? "rejected" : "accepted");
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        setEditing(false);
        setConfirmReject(false);
        onResolved("stale", err.message);
      } else toast("error", err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-lg border border-border-soft bg-surface" aria-labelledby={`sug-${s.id}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h3 id={`sug-${s.id}`} className="text-sm font-semibold text-fg">
          {s.achievement_id ? t("cv2.sug.fromAchievement") : t("cv2.sug.title")}
        </h3>
        <Status tone={outdated ? "warn" : "brand"}>{outdated ? t("cv2.sug.outdated") : t("cv.draft")}</Status>
        <span className="num ms-auto text-xs text-fg-3">
          v{s.base_version} → v{s.base_version + 1} · {timeAgo(s.created_at)}
        </span>
      </header>

      <div className="px-4 py-4">
        {outdated && (
          <Notice tone="warn" icon={<AlertTriangle />} title={t("cv2.sug.outdatedTitle")} className="mb-4">
            {t("cv2.sug.outdatedText").replace("{base}", String(s.base_version)).replace("{cur}", String(master.version))}
          </Notice>
        )}
        <ul className="divide-y divide-border">
          {changes.map((c, i) => (
            <ChangeDiff key={i} change={c} master={cur} draft={draftData} />
          ))}
        </ul>
        {s.rationale && (
          <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-fg-3">
            <span className="font-medium text-fg-2">{t("cv2.sug.rationale")}</span> {s.rationale}
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <Button onClick={() => guard(() => act("accept"))} loading={busy === "accept"} disabled={outdated || !!busy}>
          <Check /> {t("cv2.sug.accept")}
        </Button>
        <Button
          variant="secondary"
          disabled={outdated || !!busy}
          onClick={() =>
            guard(() => {
              setDraft(normalizeCV(s.draft_data));
              setEditing(true);
            })
          }
        >
          <PenLine /> {t("cv2.sug.edit")}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmReject(true)} disabled={!!busy}>
          <X /> {t("common.reject")}
        </Button>
        <Button variant="link" size="sm" className="ms-auto" onClick={onPreview} aria-pressed={previewing}>
          <Eye /> {previewing ? t("cv2.sug.previewing") : t("cv2.sug.preview")}
        </Button>
      </footer>

      <Dialog open={editing} onOpenChange={(o) => !busy && setEditing(o)}>
        <DialogContent
          wide
          title={t("cv2.sug.editTitle")}
          description={t("cv2.sug.editDesc")}
          footer={
            <>
              <span className="me-auto self-center text-xs text-fg-3">
                {editedSections.length
                  ? `${t("cv2.save.changes")} ${editedSections.map((k) => t(sectionTitleKey(k))).join(", ")}`
                  : t("cv2.save.noChanges")}
              </span>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy === "edit"}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => act("edit")} loading={busy === "edit"} disabled={!editedSections.length}>
                <Check /> {t("cv2.sug.acceptEdited")}
              </Button>
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <CVEditor value={draft} onChange={setDraft} idPrefix={`sug-${s.id}`} defaultOpen={[...new Set(changes.map((c) => c.section as SectionKey))]} />
            <div className="hidden lg:block">
              <div className="sticky top-0">
                <CVDocument data={draft} marks={suggestionMarks(s)} compact label={t("cv2.preview.title")} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title={t("cv2.sug.rejectTitle")}
        description={t("cv2.sug.rejectDesc")}
        confirmLabel={t("common.reject")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={busy === "reject"}
        onConfirm={() => act("reject")}
      />
    </article>
  );
}

/** Suggestions that can no longer be applied (the Master CV changed after they were drafted). */
export function StaleSuggestions({ items }: { items: Suggestion[] }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <details className="rounded-lg border border-border-soft bg-surface-2/50 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-fg">
        {t("cv2.sug.staleList")} <span className="num text-fg-3">({items.length})</span>
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-fg-3">{t("cv2.sug.staleExplain")}</p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {items.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
            <span className="min-w-0 flex-1 text-fg-2">{s.changes.map((c) => c.summary).join("; ") || "—"}</span>
            <span className="num text-xs text-fg-3">
              v{s.base_version} · {timeAgo(s.created_at)}
            </span>
          </li>
        ))}
      </ul>
      <Button asChild variant="link" size="sm" className="mt-2">
        <Link href="/achievements">{t("cv2.sug.regenerate")}</Link>
      </Button>
    </details>
  );
}
