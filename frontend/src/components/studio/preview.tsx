"use client";

import { ExternalLink, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { LinkedinIcon } from "@/components/brand-icons";
import { ClaimReportPanel } from "@/components/claims";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Status } from "@/components/ui/card";
import { useI18n, type TKey } from "@/lib/i18n";
import type { IntegrationStatus, User } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { STATUS_TONE } from "./editor";
import { asReport, blockingCount, fill, type StudioPost } from "./model";

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

/** Publishing: explicit, confirmed, never automatic. */
export function PublishSection({ post, dirty, busy, linkedin, notConnected, onPublish }: Omit<PreviewProps, "user" | "content" | "tags" | "post"> & { post: StudioPost }) {
  const { t, locale } = useI18n();
  const report = asReport(post.claim_check);
  const blocking = blockingCount(report);
  const connected = !!linkedin?.connected;
  const canPublish = connected && !notConnected && busy === null && ["draft", "failed", "uncertain"].includes(post.status);

  return (
    <>
      <section aria-labelledby="publish-h" className="flex flex-col gap-3" aria-live="polite">
        <div className="flex items-center gap-2">
          <h2 id="publish-h" className="flex items-center gap-2 text-sm font-extrabold text-fg">
            <LinkedinIcon className="size-4 text-primary-text" />
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
    </>
  );
}

/** The claim check for the open post: every number, skill, credential and role compared with the evidence. */
export function EvidenceSection({ post, dirty }: { post: StudioPost; dirty: boolean }) {
  const { t } = useI18n();
  const report = asReport(post.claim_check);
  return (
    <>
      <section aria-labelledby="evidence-h" className="flex flex-col gap-3">
        <h2 id="evidence-h" className="flex items-center gap-2 text-sm font-extrabold text-fg">
          <ShieldCheck className="size-4 text-primary-text" aria-hidden />
          {t("studio2.v1.evidence")}
        </h2>
        {report ? (
          <ClaimReportPanel report={report} showSupported />
        ) : (
          <p className="text-sm text-fg-3">{t("studio2.evidence.none")}</p>
        )}
        {dirty && post.achievement_id && <p className="text-xs text-warn">{t("studio2.evidence.dirty")}</p>}
        {!post.achievement_id && <p className="text-xs text-fg-3">{t("studio2.evidence.freetext")}</p>}
      </section>
    </>
  );
}
