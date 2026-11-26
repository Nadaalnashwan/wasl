"use client";

import { ExternalLink, Globe, Send } from "lucide-react";
import Link from "next/link";
import { LinkedinIcon } from "@/components/brand-icons";
import { ClaimReportPanel } from "@/components/claims";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/card";
import { useI18n, type TKey } from "@/lib/i18n";
import type { IntegrationStatus, User } from "@/lib/types";
import { cn, fmtDate, isArabic } from "@/lib/utils";
import { STATUS_TONE } from "./editor";
import { asReport, blockingCount, fill, type StudioPost } from "./model";
import { PrivatePostImage } from "./post-image";

function LinkedInPreview({ user, content, tags, post }: { user: User | null; content: string; tags: string[]; post: StudioPost }) {
  const { t } = useI18n();
  const name = user?.full_name || user?.email || "";
  const initials = name
    .split(/[\s@]+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const images = post.images ?? [];
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm shadow-sm" aria-label={t("studio.preview")}>
      <div className="flex items-start gap-2.5 px-4 pt-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text" aria-hidden>
          {initials || "?"}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg" dir="auto">
            {name}
          </div>
          <div className="truncate text-xs text-fg-3" dir="auto">
            {user?.headline || t("studio2.preview.member")}
          </div>
          <div className="flex items-center gap-1 text-xs text-fg-3">
            {t("studio2.preview.now")} · <Globe className="size-3" aria-label={t("studio2.preview.public")} />
          </div>
        </div>
      </div>
      <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-fg" dir={isArabic(content) ? "rtl" : "ltr"}>
        {content || <span className="text-fg-3">{t("studio2.preview.empty")}</span>}
        {tags.length > 0 && (
          <>
            {"\n\n"}
            <span className="text-primary-text">{tags.join(" ")}</span>
          </>
        )}
      </div>
      {images.length > 0 && (
        <div className={cn("grid gap-0.5 border-t border-border", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((img, i) => (
            <div key={img.id} className={cn("overflow-hidden bg-surface-2", images.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square")}>
              <PrivatePostImage image={img} />
            </div>
          ))}
        </div>
      )}
      <figcaption className="border-t border-border px-4 py-2 text-xs text-fg-3">{t("studio2.preview.caption")}</figcaption>
    </figure>
  );
}

export type PreviewProps = {
  user: User | null;
  post: StudioPost | null;
  content: string;
  tags: string[];
  dirty: boolean;
  busy: string | null;
  linkedin?: IntegrationStatus;
  notConnected: string | null;
  onPublish: () => void;
};

export function PreviewPanel({ user, post, content, tags, dirty, busy, linkedin, notConnected, onPublish }: PreviewProps) {
  const { t, locale } = useI18n();
  if (!post) {
    return <p className="border-s-2 border-border py-1 ps-4 text-sm leading-relaxed text-fg-3">{t("studio2.preview.none")}</p>;
  }
  const report = asReport(post.claim_check);
  const blocking = blockingCount(report);
  const connected = !!linkedin?.connected;
  const canPublish = connected && !notConnected && busy === null && ["draft", "failed", "uncertain"].includes(post.status);

  return (
    <div className="flex flex-col gap-6">
      <LinkedInPreview user={user} content={content} tags={tags} post={post} />

      {/* Publishing */}
      <section aria-labelledby="publish-h" className="flex flex-col gap-3" aria-live="polite">
        <div className="flex items-center gap-2">
          <h2 id="publish-h" className="text-sm font-semibold text-fg">
            {t("studio2.publish.title")}
          </h2>
          <Status tone={STATUS_TONE[post.status]} className="ms-auto">
            {t(`post.status.${post.status}` as TKey)}
          </Status>
        </div>

        {post.status === "published" && (
          <Notice tone="ok" title={fill(t("studio2.publish.done"), { d: fmtDate(post.published_at, locale) })}>
            {post.linkedin_post_urn && (
              <a
                className="mt-1 inline-flex items-center gap-1.5 font-medium text-primary-text hover:underline"
                href={`https://www.linkedin.com/feed/update/${post.linkedin_post_urn}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-3.5 rtl:-scale-x-100" />
                {t("studio2.publish.view")}
              </a>
            )}
          </Notice>
        )}
        {post.status === "publishing" && <Notice tone="info">{t("studio2.publish.inprogress")}</Notice>}
        {post.status === "failed" && <Notice tone="bad" title={t("studio2.publish.failed")}>{post.publish_error}</Notice>}
        {post.status === "uncertain" && (
          <Notice tone="warn" title={t("studio2.publish.uncertain")}>
            {post.publish_error && <span className="block">{post.publish_error}</span>}
            {t("studio2.publish.uncertain.d")}
          </Notice>
        )}

        {post.status !== "published" && post.status !== "publishing" && (
          <>
            {blocking > 0 && <p className="text-xs text-warn">{fill(t("studio2.publish.blocking"), { n: blocking })}</p>}
            <Button onClick={onPublish} disabled={!canPublish} className="w-full">
              <Send className="rtl:-scale-x-100" />
              {post.status === "failed" ? t("studio2.publish.retry") : post.status === "uncertain" ? t("studio2.publish.recheck") : t("studio.publish")}
            </Button>
            {dirty && <p className="text-xs text-fg-3">{t("studio2.publish.dirty")}</p>}
            {(!connected || notConnected) && (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
                <LinkedinIcon className="mt-0.5 size-4 shrink-0 text-fg-3" />
                <div className="min-w-0 text-fg-2">
                  {notConnected || (linkedin?.configured_on_server === false ? t("studio.linkedin.unconfigured") : t("studio.linkedin.off"))}
                  {linkedin?.configured_on_server !== false && (
                    <Link href="/settings#integrations" className="mt-1 block font-medium text-primary-text hover:underline">
                      {t("studio2.publish.connect")}
                    </Link>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-fg-3">{t("studio2.publish.never_auto")}</p>
          </>
        )}
      </section>

      {/* Evidence */}
      <section aria-labelledby="evidence-h" className="flex flex-col gap-3 border-t border-border pt-5">
        <h2 id="evidence-h" className="text-sm font-semibold text-fg">
          {t("studio2.evidence")}
        </h2>
        {report ? (
          <ClaimReportPanel report={report} showSupported />
        ) : (
          <p className="text-sm text-fg-3">{t("studio2.evidence.none")}</p>
        )}
        {dirty && post.achievement_id && <p className="text-xs text-warn">{t("studio2.evidence.dirty")}</p>}
        {!post.achievement_id && <p className="text-xs text-fg-3">{t("studio2.evidence.freetext")}</p>}
      </section>
    </div>
  );
}
