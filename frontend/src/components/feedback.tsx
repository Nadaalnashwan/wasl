"use client";

import { AlertTriangle, PlugZap, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { EmptyBoxArt, Gear } from "./sketch/illustrations";

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-soft" role="status">
      <Gear className="gear-spin size-9 text-ink" />
      <span className="font-hand text-xl">{label ?? t("common.loading")}</span>
    </div>
  );
}

/** Staged progress for long AI calls: shows which workflow step is likely running. */
export function AiWorking({ steps }: { steps: string[] }) {
  return (
    <Card tone="tint" className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
      <div className="flex items-end gap-1">
        <Gear className="gear-spin size-12 text-ink" />
        <Gear className="gear-spin-rev size-8 text-ink" teeth={6} fill="var(--sky-2)" />
      </div>
      <ol className="flex flex-wrap justify-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="sketch-pill bg-paper px-3 py-1 font-hand text-base" style={{ animation: `pop-in .35s ${i * 0.9}s both` }}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="sketch-dashed flex flex-col items-center gap-3 px-6 py-10 text-center">
      <EmptyBoxArt className="h-28 w-auto" />
      <h3 className="font-hand text-2xl">{title}</h3>
      {text && <p className="max-w-md text-sm text-ink-soft">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  const { t } = useI18n();
  if (!error) return null;
  const ai = error instanceof ApiError && error.code === "ai_unavailable";
  return (
    <div role="alert" className={`sketch-soft flex items-start gap-3 p-4 ${ai ? "bg-warn-fill" : "bg-bad-fill"}`}>
      {ai ? <PlugZap className="mt-0.5 size-5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0" />}
      <div className="flex-1 text-sm">
        {ai && <div className="font-hand text-lg">{t("empty.ai")}</div>}
        <p>{error.message}</p>
        {ai && (
          <Link href="/settings" className="mt-1 inline-block font-semibold underline">
            {t("nav.settings")} →
          </Link>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
}
