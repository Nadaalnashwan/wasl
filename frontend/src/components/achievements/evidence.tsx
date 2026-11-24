"use client";

import { AlertTriangle, ExternalLink, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { Notice } from "@/components/feedback";
import { Status } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import { cn, isArabic } from "@/lib/utils";
import { confidenceLevel, cvUpdateTone, fmt, repoEvidence, sourceRef, stateKey, STATUS_TONE, verifiedQuotes, type CVUpdate } from "./shared";

/** "Needs your confirmation" / "Confirmed by you" / "Rejected" — the user's decision, never the AI's. */
export function DecisionStatus({ a, className }: { a: Pick<Achievement, "status">; className?: string }) {
  const { t } = useI18n();
  return (
    <Status tone={STATUS_TONE[a.status]} className={className}>
      {t(stateKey(a.status))}
    </Status>
  );
}

export function ConfidenceText({ value, className }: { value: number; className?: string }) {
  const { t } = useI18n();
  const level = confidenceLevel(value);
  return (
    <span className={cn("text-xs text-fg-3", className)}>
      {t("achievements2.confidence")}: <span className={cn("font-medium", level === "low" ? "text-warn" : "text-fg-2")}>{t(`achievements2.confidence.${level}`)}</span>
    </span>
  );
}

/**
 * Evidence block. "Evidence verified" means a quote was found word-for-word in the source —
 * it is shown separately from the user's own confirmation.
 */
export function EvidencePanel({ a }: { a: Achievement }) {
  const { t } = useI18n();
  const quotes = verifiedQuotes(a);
  const repo = repoEvidence(a);
  const ref = sourceRef(a);
  const unverified = a.unverified_quotes ?? 0;

  if (a.source === "manual" && quotes.length === 0) {
    return (
      <p className="flex items-start gap-2 text-sm text-fg-2">
        <UserCheck className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
        <span>{t("achievements2.evidence.own")}</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {quotes.length > 0 ? (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
            <ShieldCheck className="size-4" aria-hidden /> {fmt(t("achievements2.evidence.verified_n"), { n: quotes.length })}
          </p>
          <p className="mt-1 text-xs text-fg-3">{t("achievements2.evidence.verified.d")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {quotes.map((q, i) => (
              <li key={i}>
                <blockquote
                  className="border-s-2 border-ok/50 ps-3 text-sm leading-relaxed text-fg"
                  dir={isArabic(q.quote || "") ? "rtl" : "auto"}
                >
                  “{q.quote}”
                </blockquote>
                {q.source && <p className="mt-0.5 ps-3.5 text-xs text-fg-3">{q.source}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-warn">
            <AlertTriangle className="size-4" aria-hidden /> {t("achievements2.evidence.none")}
          </p>
          <p className="mt-1 text-xs text-fg-3">{t("achievements2.evidence.none.d")}</p>
        </div>
      )}

      {unverified > 0 && <p className="text-xs text-fg-3">{fmt(t("achievements2.evidence.unverified_n"), { n: unverified })}</p>}

      {!!a.dropped_terms?.length && (
        <p className="text-xs text-fg-3">
          {t("achievements2.evidence.dropped")}: <span className="text-fg-2">{a.dropped_terms.join(", ")}</span>
        </p>
      )}

      {repo && (
        <p className="text-xs text-fg-3">
          {t("achievements2.evidence.github")}
          {repo.url && (
            <>
              {" · "}
              <a href={repo.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline">
                {repo.repo || ref} <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </p>
      )}

      {ref && !repo && (
        <p className="text-xs text-fg-3">
          {t("achievements2.evidence.source")}: <span className="text-fg-2">{ref}</span>
        </p>
      )}
    </div>
  );
}

/** Result of suggest-cv-update / auto CV update, with a link to the Master CV. */
export function CvUpdateNotice({ result, className }: { result: CVUpdate | null | undefined; className?: string }) {
  const { t } = useI18n();
  if (!result) return null;
  const tone = cvUpdateTone(result.status);
  const extra = result.status === "duplicate" || result.status === "stale" || result.status === "conflict" || result.status === "ai_unavailable" ? result.reason : result.status === "no_changes" ? result.rationale : undefined;
  return (
    <Notice tone={tone} className={className} title={t(`achievements2.cv.${result.status}`)}>
      {extra && <p className="mt-0.5">{extra}</p>}
      <Link href="/cv" className="mt-1 inline-block font-medium text-primary-text hover:underline">
        {t("achievements2.cv.open")} <span aria-hidden className="inline-block rtl:rotate-180">→</span>
      </Link>
    </Notice>
  );
}
