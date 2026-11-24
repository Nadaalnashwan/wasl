"use client";

import { AlertCircle, ChevronRight, ShieldCheck, UserCheck, UserPen } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import { cn, fmtDate, isArabic } from "@/lib/utils";
import { ConfidenceText, DecisionStatus } from "./evidence";
import { CATEGORY_ICON, fmt, sourceRef, SOURCE_ICON, verifiedQuotes } from "./shared";

/** One dense, clickable row. All actions live in the detail drawer, so the row is a single button. */
export function AchievementRow({ a, onOpen, active }: { a: Achievement; onOpen: (a: Achievement) => void; active?: boolean }) {
  const { t, locale } = useI18n();
  const Icon = CATEGORY_ICON[a.category] ?? CATEGORY_ICON.project;
  const SIcon = SOURCE_ICON[a.source] ?? SOURCE_ICON.manual;
  const quotes = verifiedQuotes(a).length;
  const ref = sourceRef(a);
  const needsContribution = a.status === "pending" && a.needs_contribution_confirmation;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(a)}
        className={cn(
          "group flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          active && "bg-surface-2",
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="min-w-0 text-sm font-medium break-words text-fg [overflow-wrap:anywhere]" dir={isArabic(a.title) ? "rtl" : undefined}>
              {a.title}
            </span>
            <DecisionStatus a={a} className="shrink-0" />
          </span>
          {a.description && (
            <span className="mt-0.5 line-clamp-1 block text-sm text-fg-3" dir={isArabic(a.description) ? "rtl" : undefined}>
              {a.description}
            </span>
          )}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
            <span>{t(`ach.cat.${a.category}`)}</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <SIcon className="size-3 shrink-0" aria-hidden />
              <span className="max-w-[14rem] truncate">{ref || t(`achievements2.source.${a.source}`)}</span>
            </span>
            <span className="num">{a.occurred_on || fmtDate(a.created_at, locale)}</span>
            {quotes > 0 ? (
              <span className="inline-flex items-center gap-1 text-ok">
                <ShieldCheck className="size-3" aria-hidden /> {fmt(t("achievements2.evidence.verified_n"), { n: quotes })}
              </span>
            ) : a.source === "manual" ? (
              <span className="inline-flex items-center gap-1">
                <UserCheck className="size-3" aria-hidden /> {t("achievements2.evidence.own")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warn">
                <AlertCircle className="size-3" aria-hidden /> {t("achievements2.evidence.none")}
              </span>
            )}
            {a.status === "pending" && a.source !== "manual" && <ConfidenceText value={a.confidence} />}
            {needsContribution && (
              <span className="inline-flex items-center gap-1 font-medium text-warn">
                <UserPen className="size-3" aria-hidden /> {t("achievements2.contrib.needed")}
              </span>
            )}
            {a.status === "confirmed" && a.contribution_note && (
              <span className="inline-flex items-center gap-1">
                <UserPen className="size-3" aria-hidden /> {t("achievements2.contrib.noted")}
              </span>
            )}
            {a.duplicate_of && (
              <span className="inline-flex items-center gap-1 text-warn">
                <AlertCircle className="size-3" aria-hidden /> {fmt(t("achievements2.duplicate"), { t: a.duplicate_of.title })}
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-3 opacity-60 group-hover:opacity-100 rtl:rotate-180" aria-hidden />
      </button>
    </li>
  );
}
