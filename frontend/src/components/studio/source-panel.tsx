"use client";

import { Award, FilePlus2, PenLine, Search, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorNote, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Textarea } from "@/components/ui/form";
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

function Step({ n, id, title, children, last }: { n: number; id: string; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <section aria-labelledby={id} className={cn("relative ps-12", !last && "pb-7")}>
      {/* the numbered rail that joins the steps */}
      <span className="num absolute start-0 top-0 grid size-8 place-items-center rounded-full border-[1.5px] border-ink bg-primary-soft text-sm font-extrabold text-fg" aria-hidden>
        {n}
      </span>
      {!last && <span className="absolute start-[15px] top-9 bottom-1 w-px border-s-[1.5px] border-dashed border-border-strong" aria-hidden />}
      <h3 id={id} className="pt-1 text-[15px] font-extrabold text-fg">
        {title}
      </h3>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

const MODE_ICON = { achievement: Award, describe: PenLine, improve: Wand2 } as const;

export function SourcePanel(p: SourcePanelProps) {
  const { t } = useI18n();
  const ai = p.busy === "generate" || p.busy === "improve" || p.busy === "evaluate";
  const canGenerate = p.mode === "achievement" ? !!p.achievementId : p.free.trim().length >= 20;
  const modes: SourceMode[] = ["achievement", "describe", "improve"];

  return (
    <div className="ink-card overflow-hidden">
      <header className="flex items-start gap-3 border-b-[1.5px] border-ink bg-primary-soft px-5 py-4 sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-surface text-primary-text" aria-hidden>
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-fg">{t("studio2.v1.composer")}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-2">{t("studio2.v1.composer.d")}</p>
        </div>
        {p.onNew && (
          <Button variant="secondary" size="sm" onClick={p.onNew} className="shrink-0">
            <FilePlus2 />
            {t("studio2.v1.new")}
          </Button>
        )}
      </header>

      <div className="px-5 py-6 sm:px-6">
        <Step n={1} id="studio-step-1" title={t("studio2.v1.step1")}>
          {/* source tabs: v1's tab strip with icons */}
          <div role="radiogroup" aria-label={t("studio.source")} className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-2 p-1">
            {modes.map((m) => {
              const Icon = MODE_ICON[m];
              const on = p.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => p.setMode(m)}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-center text-xs leading-tight font-bold transition-colors sm:flex-row sm:gap-1.5",
                    on ? "border-[1.5px] border-ink bg-surface text-fg shadow-[2px_2px_0_var(--ink-shadow)] rtl:shadow-[-2px_2px_0_var(--ink-shadow)]" : "text-fg-2 hover:bg-surface hover:text-fg",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", on ? "text-primary-text" : "")} aria-hidden />
                  {t(`studio2.v1.tab.${m}` as TKey)}
                </button>
              );
            })}
          </div>

          {p.mode === "achievement" && <AchievementPicker {...p.achievements} value={p.achievementId} onChange={p.setAchievementId} />}

          {p.mode === "describe" && (
            <Field label={t("studio2.describe.label")} hint={t("studio2.describe.hint")}>
              <Textarea
                value={p.free}
                onChange={(e) => p.setFree(e.target.value)}
                className="min-h-32"
                maxLength={4000}
                dir="auto"
                placeholder={t("studio2.describe.ph")}
              />
            </Field>
          )}

          {p.mode === "improve" && (
            <Field label={t("studio2.improve.label")} hint={t("studio2.improve.hint")}>
              <Textarea value={p.draftText} onChange={(e) => p.setDraftText(e.target.value)} className="min-h-40" maxLength={3000} dir="auto" />
            </Field>
          )}
        </Step>

        <Step n={2} id="studio-step-2" title={t("studio2.v1.step2")}>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-fg-2">{t("studio.tone")}</legend>
            <div className="flex flex-wrap gap-2">
              {TONES.map((x) => (
                <label
                  key={x}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary/40",
                    p.tone === x ? "border-ink bg-primary text-on-primary" : "border-border bg-surface text-fg-2 hover:border-border-strong hover:text-fg",
                  )}
                >
                  <input type="radio" name="studio-tone" value={x} checked={p.tone === x} onChange={() => p.setTone(x)} className="sr-only" />
                  {t(`tone.${x}` as TKey)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-fg-2" id="studio-lang-label">
              {t("studio.language")}
            </span>
            <Segmented
              size="sm"
              ariaLabel={t("studio.language")}
              value={p.lang}
              onChange={p.setLang}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
              ]}
            />
          </div>
          {p.mode !== "improve" && (
            <Field label={t("studio.instructions")} hint={t("studio2.instructions.hint")}>
              <Textarea value={p.instructions} onChange={(e) => p.setInstructions(e.target.value)} className="min-h-16" maxLength={500} dir="auto" />
            </Field>
          )}
        </Step>

        <Step n={3} id="studio-step-3" title={t("studio2.v1.step3")} last>
          {p.mode === "improve" ? (
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
              size="sm"
              onClick={p.onEvaluate}
              loading={p.busy === "evaluate"}
              disabled={p.free.trim().length < 20 || p.busy !== null || p.evaluationIsCurrent}
              className="w-full"
            >
              {t("studio2.eval.button")}
            </Button>
          )}
          {ai && (
            <span className="sr-only" role="status">
              {t("common.loading")}
            </span>
          )}
        </Step>

        {p.mode === "describe" && p.evaluationIsCurrent && p.evaluated && (
          <section aria-label={t("studio2.eval.button")} className="mt-6 border-t border-border pt-5">
            <EvaluationReview result={p.evaluated} notes={p.contributionNotes} onNote={p.setContributionNote} onReview={p.onReview} busy={p.busy} />
          </section>
        )}
      </div>
    </div>
  );
}
