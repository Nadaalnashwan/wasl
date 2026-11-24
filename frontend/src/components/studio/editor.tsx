"use client";

import { AlertTriangle, CheckCircle2, Copy, FilePlus2, ImagePlus, Save, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { AiWorking, EmptyState, ErrorNote } from "@/components/feedback";
import { ClaimReportPanel } from "@/components/claims";
import { Button } from "@/components/ui/button";
import { Badge, Status, type BadgeTone } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";
import type { ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn, isArabic, timeAgo } from "@/lib/utils";
import { asReport, blockingCount, type Improved, MAX_CONTENT, MAX_HASHTAGS, MAX_IMAGES, normalizeTag, type StudioPost } from "./model";
import { PrivatePostImage } from "./post-image";

export const STATUS_TONE: Record<StudioPost["status"], BadgeTone> = {
  draft: "neutral",
  publishing: "brand",
  published: "ok",
  failed: "bad",
  uncertain: "warn",
};

function snippet(s: string, n = 64) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

function HashtagEditor({ tags, onChange, disabled }: { tags: string[]; onChange: (t: string[]) => void; disabled: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState("");
  function add() {
    const tag = normalizeTag(draft);
    if (!tag || tags.length >= MAX_HASHTAGS || tags.some((x) => x.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, tag]);
    setDraft("");
  }
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium text-fg-2">
          {t("studio2.hashtags")}
        </label>
        <span className="num text-xs text-fg-3">
          {tags.length}/{MAX_HASHTAGS}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary-soft ps-2 pe-1 text-xs font-medium text-primary-text" dir="auto">
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== tag))}
                className="grid size-5 place-items-center rounded hover:bg-surface"
                aria-label={`${t("studio2.hashtags.remove")} ${tag}`}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && tags.length < MAX_HASHTAGS && (
          <Input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder={t("studio2.hashtags.ph")}
            className="h-7 w-36 text-xs"
            maxLength={60}
            dir="auto"
          />
        )}
      </div>
    </div>
  );
}

function Images({
  post,
  editable,
  busy,
  onUpload,
  onDelete,
}: {
  post: StudioPost;
  editable: boolean;
  busy: string | null;
  onUpload: (f: FileList | null) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const images = post.images ?? [];
  if (!images.length && !editable) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-fg-2">{t("studio2.images")}</span>
        <span className="num text-xs text-fg-3">
          {images.length}/{MAX_IMAGES}
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-2">
        {images.map((img) => (
          <li key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
            <PrivatePostImage image={img} />
            {editable && (
              <button
                type="button"
                aria-label={`${t("studio2.images.remove")}: ${img.filename}`}
                disabled={busy !== null}
                onClick={() => onDelete(img.id)}
                className="absolute end-1 top-1 grid size-6 place-items-center rounded-md border border-border bg-surface text-fg-2 shadow-sm hover:text-bad disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {editable && images.length < MAX_IMAGES && (
          <li>
            <label
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-center text-fg-3 transition-colors focus-within:ring-2 focus-within:ring-primary/30",
                busy === null ? "cursor-pointer hover:bg-surface-2 hover:text-fg" : "cursor-not-allowed opacity-60",
              )}
            >
              <ImagePlus className="size-4" aria-hidden />
              <span className="text-[11px] leading-tight">{busy === "images" ? t("studio2.images.uploading") : t("studio2.images.add")}</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className="sr-only"
                disabled={busy !== null}
                onChange={(e) => {
                  onUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {editable && <p className="mt-1.5 text-xs text-fg-3">{t("studio2.images.hint")}</p>}
    </div>
  );
}

export type EditorProps = {
  posts: StudioPost[] | null;
  current: StudioPost | null;
  onSelect: (p: StudioPost) => void;
  onNew: () => void;
  content: string;
  setContent: (v: string) => void;
  tags: string[];
  setTags: (v: string[]) => void;
  dirty: boolean;
  editable: boolean;
  busy: string | null;
  error: ApiError | null;
  onSave: () => void;
  onCopy: (text: string) => void;
  onDelete: (p: StudioPost) => void;
  onUpload: (f: FileList | null) => void;
  onDeleteImage: (id: string) => void;
  improved: Improved | null;
  onDismissImproved: () => void;
  sourceLabel: string | null;
  aiSteps: string[] | null;
};

export function Editor(p: EditorProps) {
  const { t } = useI18n();
  const textId = useId();
  const cur = p.current;
  const over = p.content.length > MAX_CONTENT;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Draft switcher */}
      <div className="flex items-center gap-2">
        <label htmlFor="studio-draft" className="sr-only">
          {t("studio2.drafts.switch")}
        </label>
        <Select
          id="studio-draft"
          className="min-w-0 flex-1"
          value={cur?.id ?? ""}
          onChange={(e) => {
            const next = p.posts?.find((x) => x.id === e.target.value);
            if (next) p.onSelect(next);
            else p.onNew();
          }}
        >
          <option value="">{t("studio2.drafts.new")}</option>
          {p.posts?.map((x) => (
            <option key={x.id} value={x.id}>
              {t(`post.status.${x.status}` as TKey)} · {snippet(x.content, 48)}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="icon" onClick={p.onNew} aria-label={t("studio2.drafts.new")} title={t("studio2.drafts.new")}>
          <FilePlus2 />
        </Button>
      </div>

      <ErrorNote error={p.error} />
      {p.aiSteps && <AiWorking steps={p.aiSteps} />}

      {p.improved && (
        <section aria-labelledby="improved-h" className="rounded-xl border border-primary/20 bg-primary-soft/40 p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 id="improved-h" className="text-sm font-semibold text-fg">
              {t("studio2.improved.title")}
            </h2>
            <Badge tone="outline">{t("studio2.improved.unsaved")}</Badge>
            <button type="button" onClick={p.onDismissImproved} className="ms-auto grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface hover:text-fg" aria-label={t("common.close")}>
              <X className="size-4" />
            </button>
          </div>
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-fg" dir="auto">
            {p.improved.content}
          </div>
          {p.improved.hashtags.length > 0 && <p className="mt-2 text-sm text-primary-text">{p.improved.hashtags.join(" ")}</p>}
          <ClaimReportPanel report={p.improved.claim_check} className="mt-4" />
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => p.onCopy(p.improved!.content + "\n\n" + p.improved!.hashtags.join(" "))}>
            <Copy />
            {t("common.copy")}
          </Button>
        </section>
      )}

      {!cur ? (
        !p.aiSteps && !p.improved && <EmptyState title={t("studio.empty")} text={t("studio2.editor.empty.d")} />
      ) : (
        <section aria-labelledby="editor-h" className="overflow-hidden rounded-lg border border-border-soft bg-surface">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
            <h2 id="editor-h" className="sr-only">
              {t("studio2.editor")}
            </h2>
            <Status tone={STATUS_TONE[cur.status]}>{t(`post.status.${cur.status}` as TKey)}</Status>
            <span className="text-xs text-fg-3">
              {t(`tone.${cur.tone}` as TKey)} · {cur.language === "ar" ? "العربية" : "English"}
            </span>
            {p.sourceLabel && (
              <span className="min-w-0 truncate text-xs text-fg-3" dir="auto">
                · {p.sourceLabel}
              </span>
            )}
            <span className="ms-auto text-xs text-fg-3">{timeAgo(cur.updated_at)}</span>
          </header>
          <div className="flex flex-col gap-4 p-4">
            <div className="-mx-2 rounded-lg px-2 pt-1 focus-within:ring-2 focus-within:ring-primary/25">
              <label htmlFor={textId} className="sr-only">
                {t("studio2.editor.text")}
              </label>
              <Textarea
                id={textId}
                value={p.content}
                onChange={(e) => p.setContent(e.target.value)}
                disabled={!p.editable}
                dir={isArabic(p.content) ? "rtl" : "ltr"}
                className="min-h-72 border-transparent bg-transparent px-0 text-[15px] shadow-none hover:border-transparent focus:border-transparent focus:ring-0"
                maxLength={MAX_CONTENT}
                aria-describedby={`${textId}-count`}
              />
              <div id={`${textId}-count`} className={cn("num mt-1 text-end text-xs", over ? "text-bad" : "text-fg-3")}>
                {p.content.length} / {MAX_CONTENT}
              </div>
            </div>
            <HashtagEditor key={cur.id} tags={p.tags} onChange={p.setTags} disabled={!p.editable} />
            <Images post={cur} editable={p.editable} busy={p.busy} onUpload={p.onUpload} onDelete={p.onDeleteImage} />
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            <Button variant="secondary" size="sm" onClick={p.onSave} loading={p.busy === "save"} disabled={!p.dirty || !p.editable || p.busy !== null}>
              <Save />
              {t("common.save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => p.onCopy(p.content + (p.tags.length ? "\n\n" + p.tags.join(" ") : ""))}>
              <Copy />
              {t("common.copy")}
            </Button>
            {p.dirty && <span className="text-xs text-warn">{t("studio2.editor.unsaved")}</span>}
            {(cur.status === "draft" || cur.status === "failed") && (
              <Button variant="ghost" size="sm" className="ms-auto text-fg-3 hover:text-bad" onClick={() => p.onDelete(cur)} disabled={p.busy !== null}>
                <Trash2 />
                {t("common.delete")}
              </Button>
            )}
          </footer>
        </section>
      )}

      {/* All drafts */}
      {!!p.posts?.length && (
        <section aria-labelledby="drafts-h">
          <h2 id="drafts-h" className="mb-2 text-sm font-semibold text-fg">
            {t("studio.drafts")} <span className="num font-normal text-fg-3">· {p.posts.length}</span>
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border-soft bg-surface">
            {p.posts.map((x) => {
              const r = asReport(x.claim_check);
              const flagged = blockingCount(r);
              const active = cur?.id === x.id;
              return (
                <li key={x.id} className={cn("flex items-center gap-2 pe-2", active && "bg-primary-soft/50")}>
                  <button
                    type="button"
                    onClick={() => p.onSelect(x)}
                    aria-current={active ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-start"
                  >
                    <Status tone={STATUS_TONE[x.status]} className="w-24 shrink-0">
                      {t(`post.status.${x.status}` as TKey)}
                    </Status>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg" dir="auto">
                      {snippet(x.content, 90)}
                    </span>
                    {r &&
                      (flagged ? (
                        <AlertTriangle className="size-4 shrink-0 text-warn" aria-label={t("studio2.drafts.flagged")} />
                      ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label={t("studio.claims.ok")} />
                      ))}
                    {(x.images?.length ?? 0) > 0 && (
                      <span className="num hidden shrink-0 items-center gap-1 text-xs text-fg-3 sm:inline-flex">
                        <ImagePlus className="size-3.5" aria-hidden />
                        {x.images.length}
                      </span>
                    )}
                    <span className="num w-8 shrink-0 text-end text-xs text-fg-3">{timeAgo(x.updated_at)}</span>
                  </button>
                  {(x.status === "draft" || x.status === "failed") && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => p.onDelete(x)}
                      disabled={p.busy !== null}
                      aria-label={`${t("common.delete")}: ${snippet(x.content, 40)}`}
                      className="text-fg-3 hover:text-bad"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
