"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import type { EvaluationResult } from "./model";

/** Review of achievements extracted from the free-text description ("Evaluate for CV"). Nothing is confirmed automatically. */
export function EvaluationReview({
  result,
  notes,
  onNote,
  onReview,
  busy,
}: {
  result: EvaluationResult;
  notes: Record<string, string>;
  onNote: (id: string, v: string) => void;
  onReview: (a: Achievement, action: "confirm" | "reject") => void;
  busy: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="text-xs text-fg-3">{t("studio2.eval.pending")}</p>
      {result.candidates.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg-2">{result.no_achievement_reason || t("studio2.eval.none")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {result.candidates.map((a) => (
            <li key={a.id} className="flex flex-col gap-2.5 px-3 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg" dir="auto">
                    {a.title}
                  </span>
                  <Badge>{t(`ach.cat.${a.category}` as TKey)}</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-fg-2" dir="auto">
                  {a.description}
                </p>
                {a.duplicate_of && (
                  <p className="mt-1 text-xs text-warn">
                    {t("ach.duplicate")}: {a.duplicate_of.title}
                  </p>
                )}
              </div>
              {a.needs_contribution_confirmation && (
                <Field label={t("studio2.eval.contribution")} hint={t("studio2.eval.contribution.hint")}>
                  <Textarea
                    className="min-h-16 text-sm"
                    value={notes[a.id] ?? a.contribution_note ?? ""}
                    onChange={(e) => onNote(a.id, e.target.value)}
                    maxLength={1500}
                    dir="auto"
                    placeholder={t("studio2.eval.contribution.ph")}
                  />
                </Field>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="xs" onClick={() => onReview(a, "confirm")} loading={busy === a.id} disabled={busy !== null}>
                  <Check />
                  {t("studio2.eval.confirm")}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onReview(a, "reject")} disabled={busy !== null}>
                  <X />
                  {t("common.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/achievements" className="text-xs font-medium text-primary-text hover:underline">
        {t("studio2.eval.all")}
      </Link>
    </div>
  );
}
