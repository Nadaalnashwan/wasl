"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { type ClaimReport, ClaimReportPanel } from "@/components/claims";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useI18n } from "@/lib/i18n";
import { isArabic } from "@/lib/utils";
import { blockingCount, fill, finalText, type StudioPost } from "./model";
import { PrivatePostImage } from "./post-image";

/**
 * Explicit confirmation before anything is sent to LinkedIn. Shows the exact final text.
 * Unresolved claims require an extra acknowledgement; an "uncertain" previous attempt requires
 * the user to confirm it was not published before a retry is allowed.
 */
export function PublishDialog({
  open,
  onOpenChange,
  post,
  content,
  tags,
  report,
  serverMessage,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post: StudioPost;
  content: string;
  tags: string[];
  report: ClaimReport | null;
  serverMessage: string | null;
  busy: boolean;
  onConfirm: (opts: { acknowledgeClaims: boolean; confirmNotPublished: boolean }) => void;
}) {
  const { t } = useI18n();
  const [ackClaims, setAckClaims] = useState(false);
  const [notPublished, setNotPublished] = useState(false);
  const blocking = blockingCount(report);
  const uncertain = post.status === "uncertain";
  const text = finalText(content, tags);
  const ready = (!blocking || ackClaims) && (!uncertain || notPublished);

  function change(o: boolean) {
    if (busy) return;
    if (!o) {
      setAckClaims(false);
      setNotPublished(false);
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        wide
        className="w-[min(96vw,720px)]"
        title={t("studio.publish")}
        description={t("studio.publish.confirm")}
        footer={
          <>
            <Button variant="secondary" onClick={() => change(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => onConfirm({ acknowledgeClaims: blocking > 0 && ackClaims, confirmNotPublished: uncertain && notPublished })}
              loading={busy}
              disabled={!ready}
            >
              {!busy && <Send className="rtl:-scale-x-100" />}
              {uncertain ? t("studio2.dialog.retry") : t("studio2.dialog.publish")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-1.5 text-xs font-medium text-fg-2">{t("studio2.dialog.final")}</h3>
            <div
              className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-fg"
              dir={isArabic(text) ? "rtl" : "ltr"}
              tabIndex={0}
              aria-label={t("studio2.dialog.final")}
            >
              {text}
            </div>
            <p className="num mt-1 text-xs text-fg-3">{fill(t("studio2.dialog.chars"), { n: text.length })}</p>
          </div>

          {(post.images?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-medium text-fg-2">{fill(t("studio2.dialog.images"), { n: post.images.length })}</h3>
              <ul className="grid grid-cols-4 gap-2">
                {post.images.map((img) => (
                  <li key={img.id} className="aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
                    <PrivatePostImage image={img} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uncertain && (
            <div className="flex flex-col gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3">
              <p className="text-sm text-fg">{t("studio2.dialog.uncertain")}</p>
              <Checkbox checked={notPublished} onChange={(e) => setNotPublished(e.target.checked)} label={t("studio2.dialog.uncertain.ack")} />
            </div>
          )}

          {blocking > 0 && (
            <div className="flex flex-col gap-3" role="group" aria-labelledby="claims-warning">
              <Notice tone="warn" title={<span id="claims-warning">{fill(t("studio2.dialog.claims"), { n: blocking })}</span>}>
                {serverMessage || t("studio2.dialog.claims.d")}
              </Notice>
              {report && <ClaimReportPanel report={report} />}
              <Checkbox
                checked={ackClaims}
                onChange={(e) => setAckClaims(e.target.checked)}
                label={t("studio2.dialog.claims.ack")}
                description={t("studio2.dialog.claims.ack.d")}
                className="rounded-lg border border-border px-3 py-2.5"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
