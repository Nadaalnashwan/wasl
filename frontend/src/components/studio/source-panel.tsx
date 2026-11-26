"use client";

import { Award, FilePlus2, PenLine, Search, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorNote, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import type { ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";
import { EvaluationReview } from "./evaluate";
import { type EvaluationResult, type SourceMode, type Tone, TONES } from "./model";

export type SourcePanelProps = {
  mode: SourceMode;
  setMode: (m: SourceMode) => void;
  achievements: { data: Achievement[] | null; loading: boolean; error: ApiError | null; reload: () => void };
  achievementId: string | null;
  setAchievementId: (id: string | null) => void;
  free: string;
  setFree: (v: string) => void;
  draftText: string;
  setDraftText: (v: string) => void;
  tone: Tone;
  setTone: (v: Tone) => void;
  lang: "en" | "ar";
  setLang: (v: "en" | "ar") => void;
  instructions: string;
  setInstructions: (v: string) => void;
  busy: string | null;
  onGenerate: () => void;
  onImprove: () => void;
  onEvaluate: () => void;
  evaluated: EvaluationResult | null;
  evaluationIsCurrent: boolean;
  contributionNotes: Record<string, string>;
  setContributionNote: (id: string, v: string) => void;
  onReview: (a: Achievement, action: "confirm" | "reject") => void;
  /** Start a fresh post (clears the editor). */
  onNew?: () => void;
};

function AchievementPicker({
  data,
  loading,
  error,
  reload,
  value,
  onChange,
}: SourcePanelProps["achievements"] & { value: string | null; onChange: (id: string | null) => void }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data ?? [];
    if (!needle) return rows;
    return rows.filter((a) => [a.title, a.description, a.impact, ...(a.skills || []), ...(a.technologies || [])].join(" ").toLowerCase().includes(needle));
  }, [data, q]);

  if (error && !data) return <ErrorNote error={error} onRetry={reload} />;
  if (loading && !data) return <SkeletonRows rows={3} />;
  if (!data?.length) {
    return (
      <div className="border-s-2 border-border py-1 ps-4 text-sm">
        <p className="font-medium text-fg">{t("studio2.src.empty")}</p>
        <p className="mt-1 text-xs text-fg-3">{t("studio2.src.empty.d")}</p>
        <Link href="/achievements" className="mt-2 inline-block text-xs font-medium text-primary-text hover:underline">
          {t("studio2.src.add")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("studio2.src.search")}
          aria-label={t("studio2.src.search")}
          className="ps-8"
        />
      </div>
      <fieldset>
        <legend className="sr-only">{t("studio.pick")}</legend>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
          {list.map((a) => {
            const checked = value === a.id;
            return (
              <li key={a.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2",
                    checked && "bg-primary-soft/60 hover:bg-primary-soft/60",
                  )}
                >
                  <input
                    type="radio"
                    name="studio-source"
                    className="mt-1 size-3.5 shrink-0 accent-[var(--primary)]"
                    checked={checked}
                    onChange={() => onChange(a.id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm leading-snug font-medium text-fg" dir="auto">
                      {a.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-3">
                      {t(`ach.cat.${a.category}` as TKey)}
                      {a.occurred_on && ` · ${fmtDate(a.occurred_on, locale)}`}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {list.length === 0 && <li className="px-3 py-4 text-center text-xs text-fg-3">{t("studio2.src.nomatch")}</li>}
        </ul>
      </fieldset>
      <p className="text-xs text-fg-3">{t("studio2.src.confirmed")}</p>
    </div>
  );
}

const SOURCE_ICON = { achievement: Award, describe: PenLine } as const;

/**
 * v1's composer: one card with pill tabs (Generate post / Improve my wording). Inside Generate, the v2 source choice
 * (from a confirmed achievement or a description), then style wishes, tone chips, language pills and the actions.
 */
export function SourcePanel(p: SourcePanelProps) {
  const { t } = useI18n();
  const ai = p.busy === "generate" || p.busy === "improve" || p.busy === "evaluate";
  const canGenerate = p.mode === "achievement" ? !!p.achievementId : p.free.trim().length >= 20;
  const improving = p.mode === "improve";
  const tab = (on: boolean) =>
    cn(
      "inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-ink px-4 text-sm font-semibold transition-colors",
      on ? "bg-ink text-bg" : "bg-surface text-fg hover:bg-primary-soft",
    );

  return (
    <div className="ink-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label={t("studio.source")} className="flex flex-wrap gap-2.5">
          <button type="button" role="tab" aria-selected={!improving} className={tab(!improving)} onClick={() => improving && p.setMode("achievement")}>
            <Sparkles className="size-4" aria-hidden />
            {t("studio.generate")}
          </button>
          <button type="button" role="tab" aria-selected={improving} className={tab(improving)} onClick={() => p.setMode("improve")}>
            <Wand2 className="size-4" aria-hidden />
            {t("studio.improve")}
          </button>
        </div>
        {p.onNew && (
          <Button variant="ghost" size="sm" onClick={p.onNew} className="ms-auto">
            <FilePlus2 />
            {t("studio2.v1.new")}
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {!improving && (
          <>
            <div role="radiogroup" aria-label={t("studio2.v1.step1")} className="grid grid-cols-2 gap-1.5 rounded-[12px] bg-surface-2 p-1">
              {(["achievement", "describe"] as const).map((m) => {
                const Icon = SOURCE_ICON[m];
                const on = p.mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => p.setMode(m)}
                    className={cn(
                      "flex min-h-10 items-center justify-center gap-2 rounded-[9px] px-2 text-sm font-semibold transition-colors",
                      on ? "border-[1.5px] border-ink bg-surface text-fg" : "text-fg-2 hover:bg-surface hover:text-fg",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {t(`studio2.v1.tab.${m}` as TKey)}
                  </button>
                );
              })}
            </div>

            {p.mode === "achievement" && <AchievementPicker {...p.achievements} value={p.achievementId} onChange={p.setAchievementId} />}

            {p.mode === "describe" && (
              <Field label={t("studio2.describe.label")} hint={t("studio2.describe.hint")}>
                <Textarea value={p.free} onChange={(e) => p.setFree(e.target.value)} className="min-h-28" maxLength={4000} dir="auto" placeholder={t("studio2.describe.ph")} />
              </Field>
            )}

            <Field label={t("studio.instructions")} hint={t("studio2.instructions.hint")}>
              <Textarea value={p.instructions} onChange={(e) => p.setInstructions(e.target.value)} className="min-h-16" maxLength={500} dir="auto" />
            </Field>
          </>
        )}

        {improving && (
          <Field label={t("studio2.improve.label")} hint={t("studio2.improve.hint")}>
            <Textarea value={p.draftText} onChange={(e) => p.setDraftText(e.target.value)} className="min-h-40" maxLength={3000} dir="auto" />
          </Field>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg">{t("studio.tone")}</legend>
          <div className="flex flex-wrap gap-2">
            {TONES.map((x) => (
              <label
                key={x}
                className={cn(
                  "cursor-pointer rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary/40",
                  p.tone === x ? "border-ink bg-primary text-on-primary" : "border-ink/70 bg-surface text-fg hover:bg-primary-soft",
                )}
              >
                <input type="radio" name="studio-tone" value={x} checked={p.tone === x} onChange={() => p.setTone(x)} className="sr-only" />
                {t(`tone.${x}` as TKey)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg">{t("studio.language")}</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["en", "English"],
                ["ar", "العربية"],
              ] as const
            ).map(([v, label]) => (
              <label
                key={v}
                className={cn(
                  "cursor-pointer rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary/40",
                  p.lang === v ? "border-ink bg-primary text-on-primary" : "border-ink/70 bg-surface text-fg hover:bg-primary-soft",
                )}
              >
                <input type="radio" name="studio-lang" value={v} checked={p.lang === v} onChange={() => p.setLang(v)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3">
          {improving ? (
            <Button size="lg" onClick={p.onImprove} loading={p.busy === "improve"} disabled={p.draftText.trim().length < 20 || p.busy !== null} className="w-full">
              {p.busy !== "improve" && <Wand2 />}
              {t("studio.improve")}
            </Button>
          ) : (
            <Button size="lg" onClick={p.onGenerate} loading={p.busy === "generate"} disabled={!canGenerate || p.busy !== null} className="w-full">
              {p.busy !== "generate" && <Sparkles />}
              {t("studio.generate")}
            </Button>
          )}
          {p.mode === "describe" && (
            <Button
              variant="secondary"
              onClick={p.onEvaluate}
              loading={p.busy === "evaluate"}
              disabled={p.free.trim().length < 20 || p.busy !== null || p.evaluationIsCurrent}
              className="w-full"
            >
              {p.busy !== "evaluate" && <Sparkles />}
              {t("studio2.eval.button")}
            </Button>
          )}
          {ai && (
            <span className="sr-only" role="status">
              {t("common.loading")}
            </span>
          )}
        </div>

        {p.mode === "describe" && p.evaluationIsCurrent && p.evaluated && (
          <section aria-label={t("studio2.eval.button")} className="border-t border-border pt-5">
            <EvaluationReview result={p.evaluated} notes={p.contributionNotes} onNote={p.setContributionNote} onReview={p.onReview} busy={p.busy} />
          </section>
        )}
      </div>
    </div>
  );
}
