"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { type ClaimReport, ClaimReportPanel } from "@/components/claims";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useI18n } from "@/lib/i18n";
import { isArabic } from "@/lib/utils";
import { blockingCount, fill, finalText, type StudioPost } from "./model";
import { PrivatePostImage } from "./post-image";

export type ClaimAssertion = { claim: string; statement: string };

// mirrors the server rule (app/routers/posts.py evaluate_assertions): specific, not a generic "it's true"
const GENERIC = /^\s*(i\s+)?(confirm|agree|accept|approve|acknowledge)\b|\b(this|it|that)\s+is\s+(true|accurate|correct)\b|^\s*(true|yes|ok|okay|correct|accurate|verified|confirmed|نعم|صحيح|أؤكد|موافق)[\s.!]*$/i;
export function isSpecificStatement(claim: string, s: string): boolean {
  const v = s.trim();
  return v.length >= 20 && v.split(/\s+/).length >= 4 && !GENERIC.test(v) && v.toLowerCase() !== claim.trim().toLowerCase();
}

/**
 * Explicit confirmation before anything is sent to LinkedIn. Shows the exact final text.
 * Each unsupported / unconfirmed claim needs a specific, user-written statement of where the fact comes from
 * (stored as the user's own assertion, never as verified evidence). Contradicted claims can only be edited.
 * An "uncertain" previous attempt requires the user to confirm it was not published before a retry.
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
  onConfirm: (opts: { claimAssertions: ClaimAssertion[]; confirmNotPublished: boolean }) => void;
}) {
  const { t } = useI18n();
  const [statements, setStatements] = useState<Record<string, string>>({});
  const [notPublished, setNotPublished] = useState(false);
  const blocking = blockingCount(report);
  const uncertain = post.status === "uncertain";
  const text = finalText(content, tags);
  const flagged = (report?.unsupported ?? []).filter((c) => c.status !== "ambiguous");
  const contradicted = flagged.filter((c) => c.status === "contradicted");
  const unavailable = flagged.some((c) => c.status === "unavailable") || (report?.summary?.unavailable ?? 0) > 0;
  const assertable = flagged.filter((c) => c.status !== "contradicted" && c.status !== "unavailable");
  const missing = assertable.filter((c) => !isSpecificStatement(c.value, statements[c.value] ?? "")).length;
  const claimsOk = !blocking || (contradicted.length === 0 && !unavailable && missing === 0);
  const ready = claimsOk && (!uncertain || notPublished);

  function change(o: boolean) {
    if (busy) return;
    if (!o) {
      setStatements({});
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
              onClick={() =>
                onConfirm({
                  claimAssertions: blocking > 0 ? assertable.map((c) => ({ claim: c.value, statement: (statements[c.value] ?? "").trim() })) : [],
                  confirmNotPublished: uncertain && notPublished,
                })
              }
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
              {contradicted.length > 0 && (
                <Notice tone="bad" title={contradicted.map((c) => `“${c.value}”`).join(", ")}>
                  {t("studio2.assert.contradicted")}
                </Notice>
              )}
              {unavailable && <Notice tone="warn">{t("studio2.assert.unavailable")}</Notice>}
              {contradicted.length === 0 && !unavailable && (
                <ol className="flex flex-col gap-4 border-t border-border-soft pt-4">
                  {assertable.map((c) => (
                    <li key={`${c.type}:${c.value}`}>
                      <Field label={fill(t("studio2.assert.label"), { claim: c.value })} hint={t("studio2.assert.hint")}>
                        <Textarea
                          rows={2}
                          className="min-h-16"
                          value={statements[c.value] ?? ""}
                          maxLength={600}
                          placeholder={t("studio2.assert.placeholder")}
                          onChange={(e) => setStatements((s) => ({ ...s, [c.value]: e.target.value }))}
                        />
                      </Field>
                    </li>
                  ))}
                </ol>
              )}
              {missing > 0 && contradicted.length === 0 && !unavailable && (
                <p className="text-xs text-fg-3" aria-live="polite">
                  {fill(t("studio2.assert.missing"), { n: missing })}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
