"use client";

import { AlertCircle, Check, X } from "lucide-react";
import { useId, useState } from "react";
import { Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import { cn, isArabic } from "@/lib/utils";
import { ConfidenceText, CvUpdateNotice, DecisionStatus, EvidencePanel } from "./evidence";
import { CATEGORY_ICON, fmt, sourceRef, SOURCE_ICON } from "./shared";
import { useAchievementActions } from "./use-achievement-actions";

export function DuplicateNotice({ a }: { a: Pick<Achievement, "duplicate_of"> }) {
  const { t } = useI18n();
  if (!a.duplicate_of) return null;
  return (
    <Notice tone="warn" icon={<AlertCircle className="text-warn" />} title={fmt(t("achievements2.duplicate"), { t: a.duplicate_of.title })}>
      {t("achievements2.duplicate.d")}
    </Notice>
  );
}

export function ContributionField({
  a,
  value,
  onChange,
}: {
  a: Pick<Achievement, "contribution_question">;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const short = value.trim().length < 10;
  return (
    <Field label={t("achievements2.contrib.title")} hint={short ? t("achievements2.contrib.min") : undefined}>
      <span className="text-sm text-fg-2" dir="auto">
        {a.contribution_question || t("achievements2.contrib.default_q")}
      </span>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-24" maxLength={1500} placeholder={t("achievements2.contrib.ph")} />
    </Field>
  );
}

/**
 * Review controls for a pending achievement: duplicate warning, contribution answer, confirm / reject.
 * The achievement is only treated as the user's own once they press Confirm. The parent owns `actions`
 * so it can keep showing the CV-update result after the item leaves the pending state.
 */
export function PendingReview({
  a,
  actions,
  className,
}: {
  a: Achievement;
  actions: ReturnType<typeof useAchievementActions>;
  className?: string;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState(a.contribution_note || "");
  const needsNote = a.needs_contribution_confirmation && note.trim().length < 10;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <DuplicateNotice a={a} />
      {a.needs_contribution_confirmation && <ContributionField a={a} value={note} onChange={setNote} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={actions.busy === "confirm"} disabled={needsNote || !!actions.busy} onClick={() => actions.confirm(a, note)}>
          <Check /> {t("achievements2.confirm")}
        </Button>
        <Button size="sm" variant="secondary" loading={actions.busy === "reject"} disabled={!!actions.busy} onClick={() => actions.reject(a)}>
          <X /> {t("achievements2.reject")}
        </Button>
      </div>
    </div>
  );
}

/** A freshly extracted candidate (always pending): evidence first, then the user's decision. */
export function CandidateItem({ a, onDecided }: { a: Achievement; onDecided?: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState<Achievement>(a);
  const actions = useAchievementActions((next) => {
    if (next) setCurrent((c) => ({ ...c, ...next }));
    onDecided?.();
  });
  const Icon = CATEGORY_ICON[current.category] ?? CATEGORY_ICON.project;
  const SIcon = SOURCE_ICON[current.source] ?? SOURCE_ICON.manual;
  const hid = useId();
  const decided = current.status !== "pending";
  const ref = sourceRef(current);

  return (
    <article aria-labelledby={hid} className="flex flex-col gap-4 px-4 py-4">
      <header className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
        <div className="min-w-0 flex-1">
          <h4 id={hid} className="text-sm font-semibold text-fg" dir={isArabic(current.title) ? "rtl" : undefined}>
            {current.title}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <DecisionStatus a={current} />
            <span className="text-xs text-fg-3">{t(`ach.cat.${current.category}`)}</span>
            <span className="inline-flex items-center gap-1 text-xs text-fg-3">
              <SIcon className="size-3" aria-hidden /> {ref || t(`achievements2.source.${current.source}`)}
            </span>
            {current.occurred_on && <span className="text-xs text-fg-3">{current.occurred_on}</span>}
            {!decided && <ConfidenceText value={current.confidence} />}
          </div>
        </div>
      </header>

      {!decided && (
        <>
          {current.description && (
            <p className="text-sm leading-relaxed text-fg-2" dir={isArabic(current.description) ? "rtl" : undefined}>
              {current.description}
            </p>
          )}
          {current.impact && (
            <p className="text-sm text-fg-2">
              <span className="font-medium text-fg">{t("achievements2.meta.impact")}:</span> {current.impact}
            </p>
          )}
          {[...current.technologies, ...current.skills].length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...current.technologies, ...current.skills])].map((s) => (
                <Badge key={s} tone="outline">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          <div className="rounded-lg bg-surface-2 p-3">
            <EvidencePanel a={current} />
          </div>
          <PendingReview a={current} actions={actions} />
        </>
      )}
      <div aria-live="polite">
        <CvUpdateNotice result={actions.cvResult} />
      </div>
    </article>
  );
}
