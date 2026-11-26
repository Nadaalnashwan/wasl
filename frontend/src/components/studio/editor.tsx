"use client";

import { AlertTriangle, CheckCircle2, Copy, Globe, ImagePlus, Save, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { LinkedinIcon } from "@/components/brand-icons";
import { SpotArt } from "@/components/brand/art";
import { AiWorking, ErrorNote } from "@/components/feedback";
import { ClaimReportPanel } from "@/components/claims";
import { Button } from "@/components/ui/button";
import { Badge, Status, type BadgeTone } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import type { ApiError } from "@/lib/api";
import type { IntegrationStatus, User } from "@/lib/types";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn, isArabic, timeAgo } from "@/lib/utils";
import { asReport, blockingCount, type Improved, MAX_CONTENT, MAX_HASHTAGS, MAX_IMAGES, normalizeTag, type StudioPost } from "./model";
import { PrivatePostImage } from "./post-image";
import { PublishSection } from "./preview";
import { EvidenceReview, HighlightTextarea, type Mark, type ReviewProps } from "./review";

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

export type WorkbenchProps = {
  user: User | null;
  current: StudioPost | null;
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
  linkedin?: IntegrationStatus;
  notConnected: string | null;
  onPublish: () => void;
  review: ReviewProps;
  marks: Mark[];
  scrollSignal: number;
  onCaret: (pos: number) => void;
};

function initialsOf(name: string) {
  return (
    name
      .split(/[\s@]+/)
      .filter(Boolean)
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * The right-hand workbench, as in the original studio: the post is shown as it will look on LinkedIn and edited in
 * place; hashtags and images live inside the post; the evidence check and publishing sit underneath.
 */
export function PostWorkbench(p: WorkbenchProps) {
  const { t } = useI18n();
  const textId = useId();
  const cur = p.current;
  const over = p.content.length > MAX_CONTENT;
  const name = p.user?.full_name || p.user?.email || "";

  return (
    <section aria-labelledby="workbench-h" className="ink-card overflow-hidden">
      <header className="flex items-center gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink bg-primary-soft text-fg" aria-hidden>
          <LinkedinIcon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="workbench-h" className="font-display text-xl leading-tight text-fg">
            {t("studio.preview")}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{t("studio2.v1.preview.d")}</p>
        </div>
        {cur && (
          <Badge tone={STATUS_TONE[cur.status]} className="shrink-0">
            {t(`post.status.${cur.status}` as TKey)}
          </Badge>
        )}
      </header>

      <div className="flex flex-col gap-5 px-5 py-6 sm:px-6">
        <ErrorNote error={p.error} />
        {p.aiSteps && <AiWorking steps={p.aiSteps} />}

        {p.improved && (
          <section aria-labelledby="improved-h" className="rounded-xl border-[1.5px] border-dashed border-primary/40 bg-primary-soft/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 id="improved-h" className="text-sm font-extrabold text-fg">
                {t("studio2.improved.title")}
              </h3>
              <Badge tone="outline">{t("studio2.improved.unsaved")}</Badge>
              <button
                type="button"
                onClick={p.onDismissImproved}
                className="ms-auto grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface hover:text-fg"
                aria-label={t("common.close")}
              >
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

        {!cur && !p.aiSteps && !p.improved && (
          <div className="flex flex-col items-center rounded-xl border-[1.5px] border-dashed border-border-strong bg-bg px-6 py-10 text-center">
            <SpotArt kind="studio" className="h-28 w-auto" />
            <h3 className="mt-5 text-base font-extrabold text-fg">{t("studio2.v1.empty.t")}</h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-2">{t("studio2.v1.empty.d")}</p>
          </div>
        )}

        {cur && (
          <>
            {/* the post, as it will appear in the feed */}
            <article aria-label={t("studio.preview")} className="ink-soft">
              <div className="flex items-start gap-3 px-4 pt-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-primary-soft text-sm font-extrabold text-fg" aria-hidden>
                  {initialsOf(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-fg">
                    <bdi>{name}</bdi>
                  </div>
                  <div className="truncate text-xs text-fg-3">
                    <bdi>{p.user?.headline || t("studio2.preview.member")}</bdi>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-fg-3">
                    {t("studio2.preview.now")} · <Globe className="size-3" aria-label={t("studio2.preview.public")} />
                  </div>
                </div>
                <span className="hidden shrink-0 text-end text-xs text-fg-3 sm:block">
                  {t(`tone.${cur.tone}` as TKey)} · {cur.language === "ar" ? "العربية" : "English"}
                  <span className="block">{timeAgo(cur.updated_at)}</span>
                </span>
              </div>

              <div className="px-4 pt-3">
                <label htmlFor={textId} className="sr-only">
                  {t("studio2.editor.text")}
                </label>
                <HighlightTextarea
                  id={textId}
                  value={p.content}
                  onChange={p.setContent}
                  marks={p.marks}
                  activeKey={p.review.activeKey}
                  scrollSignal={p.scrollSignal}
                  onCaret={p.onCaret}
                  disabled={!p.editable}
                  dir={isArabic(p.content) ? "rtl" : "ltr"}
                  maxLength={MAX_CONTENT}
                  describedBy={`${textId}-count`}
                />
                <div id={`${textId}-count`} className={cn("num mt-1 text-end text-xs", over ? "text-bad" : "text-fg-3")}>
                  <span dir="ltr">
                    {p.content.length} / {MAX_CONTENT}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-4 px-4 pt-2 pb-4">
                <HashtagEditor key={cur.id} tags={p.tags} onChange={p.setTags} disabled={!p.editable} />
                <Images post={cur} editable={p.editable} busy={p.busy} onUpload={p.onUpload} onDelete={p.onDeleteImage} />
              </div>

              {p.sourceLabel && (
                <p className="border-t border-border px-4 py-2 text-xs text-fg-3">
                  {t("studio2.v1.source")}: <bdi className="font-medium text-fg-2">{p.sourceLabel}</bdi>
                </p>
              )}
            </article>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={p.onSave} loading={p.busy === "save"} disabled={!p.dirty || !p.editable || p.busy !== null}>
                <Save />
                {t("common.save")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => p.onCopy(p.content + (p.tags.length ? "\n\n" + p.tags.join(" ") : ""))}>
                <Copy />
                {t("common.copy")}
              </Button>
              {p.dirty && <span className="text-xs font-semibold text-warn">{t("studio2.editor.unsaved")}</span>}
              {(cur.status === "draft" || cur.status === "failed") && (
                <Button variant="ghost" size="sm" className="ms-auto text-fg-3 hover:text-bad" onClick={() => p.onDelete(cur)} disabled={p.busy !== null}>
                  <Trash2 />
                  {t("common.delete")}
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-6 border-t border-border pt-5">
              <EvidenceReview {...p.review} />
              <div className="border-t border-border pt-5">
                <PublishSection post={cur} dirty={p.dirty} busy={p.busy} linkedin={p.linkedin} notConnected={p.notConnected} onPublish={p.onPublish} />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Every saved post as a card, as in the original studio. */
export function DraftsGrid({
  posts,
  current,
  onSelect,
  onDelete,
  busy,
}: {
  posts: StudioPost[] | null;
  current: StudioPost | null;
  onSelect: (p: StudioPost) => void;
  onDelete: (p: StudioPost) => void;
  busy: string | null;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="drafts-h" className="mt-14">
      <h2 id="drafts-h" className="font-display text-2xl text-fg">
        <span className="brand-underline">{t("studio.drafts")}</span> <span className="num text-base font-semibold text-fg-3">· {posts?.length ?? 0}</span>
      </h2>
      {!posts?.length ? (
        <p className="mt-6 text-sm text-fg-3">{t("studio2.v1.drafts.empty")}</p>
      ) : (
        <ul className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {posts.map((x) => {
            const r = asReport(x.claim_check);
            const flagged = blockingCount(r);
            const active = current?.id === x.id;
            return (
              <li key={x.id} className={cn("ink-card flex flex-col gap-3 p-5", active && "!bg-primary-soft")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Status tone={STATUS_TONE[x.status]}>{t(`post.status.${x.status}` as TKey)}</Status>
                  <Badge tone="outline">{t(`tone.${x.tone}` as TKey)}</Badge>
                  {r &&
                    (flagged ? (
                      <AlertTriangle className="size-4 text-warn" aria-label={t("studio2.drafts.flagged")} />
                    ) : (
                      <CheckCircle2 className="size-4 text-ok" aria-label={t("studio.claims.ok")} />
                    ))}
                  <span className="num ms-auto text-xs text-fg-3">{timeAgo(x.updated_at)}</span>
                </div>
                <p className="line-clamp-4 text-sm leading-relaxed text-fg" dir="auto">
                  {x.content}
                </p>
                {(x.images?.length ?? 0) > 0 && (
                  <span className="num inline-flex items-center gap-1.5 text-xs text-fg-3">
                    <ImagePlus className="size-3.5" aria-hidden />
                    {x.images.length}
                  </span>
                )}
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <Button
                    variant={active ? "ghost" : "secondary"}
                    size="sm"
                    onClick={() => onSelect(x)}
                    aria-current={active ? "true" : undefined}
                    aria-label={`${t("common.edit")}: ${snippet(x.content, 40)}`}
                    disabled={active}
                  >
                    {active ? t("studio2.v1.opened") : t("common.edit")}
                  </Button>
                  {(x.status === "draft" || x.status === "failed") && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(x)}
                      disabled={busy !== null}
                      aria-label={`${t("common.delete")}: ${snippet(x.content, 40)}`}
                      className="ms-auto text-fg-3 hover:text-bad"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
