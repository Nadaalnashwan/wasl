"use client";

import { Search, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorNote, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/form";
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
      <div className="rounded-lg border border-dashed border-border-strong px-3 py-5 text-center text-sm">
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

export function SourcePanel(p: SourcePanelProps) {
  const { t } = useI18n();
  const ai = p.busy === "generate" || p.busy === "improve" || p.busy === "evaluate";
  const canGenerate = p.mode === "achievement" ? !!p.achievementId : p.free.trim().length >= 20;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="studio-source-h" className="flex flex-col gap-3">
        <h2 id="studio-source-h" className="text-sm font-semibold text-fg">
          {t("studio.source")}
        </h2>
        <Segmented
          size="sm"
          ariaLabel={t("studio.source")}
          value={p.mode}
          onChange={p.setMode}
          className="w-full [&>button]:flex-1"
          options={[
            { value: "achievement", label: t("studio2.mode.achievement") },
            { value: "describe", label: t("studio2.mode.describe") },
            { value: "improve", label: t("studio2.mode.improve") },
          ]}
        />

        {p.mode === "achievement" && (
          <AchievementPicker {...p.achievements} value={p.achievementId} onChange={p.setAchievementId} />
        )}

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
      </section>

      <section aria-labelledby="studio-controls-h" className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 id="studio-controls-h" className="text-sm font-semibold text-fg">
          {t("studio2.controls")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("studio.tone")}>
            <Select value={p.tone} onChange={(e) => p.setTone(e.target.value as Tone)}>
              {TONES.map((x) => (
                <option key={x} value={x}>
                  {t(`tone.${x}` as TKey)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("studio.language")}>
            <Select value={p.lang} onChange={(e) => p.setLang(e.target.value as "en" | "ar")}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </Select>
          </Field>
        </div>
        {p.mode !== "improve" && (
          <Field label={t("studio.instructions")} hint={t("studio2.instructions.hint")}>
            <Textarea value={p.instructions} onChange={(e) => p.setInstructions(e.target.value)} className="min-h-16" maxLength={500} dir="auto" />
          </Field>
        )}

        {p.mode === "improve" ? (
          <Button onClick={p.onImprove} loading={p.busy === "improve"} disabled={p.draftText.trim().length < 20 || p.busy !== null} className="w-full">
            {p.busy !== "improve" && <Wand2 />}
            {t("studio.improve")}
          </Button>
        ) : (
          <Button onClick={p.onGenerate} loading={p.busy === "generate"} disabled={!canGenerate || p.busy !== null} className="w-full">
            {p.busy !== "generate" && <Sparkles />}
            {t("studio.generate")}
          </Button>
        )}

        {p.mode === "describe" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={p.onEvaluate}
            loading={p.busy === "evaluate"}
            disabled={p.free.trim().length < 20 || p.busy !== null || p.evaluationIsCurrent}
            className="w-full"
          >
            {t("studio2.eval.button")}
          </Button>
        )}
        {ai && <span className="sr-only" role="status">{t("common.loading")}</span>}
      </section>

      {p.mode === "describe" && p.evaluationIsCurrent && p.evaluated && (
        <section aria-label={t("studio2.eval.button")} className="border-t border-border pt-5">
          <EvaluationReview result={p.evaluated} notes={p.contributionNotes} onNote={p.setContributionNote} onReview={p.onReview} busy={p.busy} />
        </section>
      )}
    </div>
  );
}
