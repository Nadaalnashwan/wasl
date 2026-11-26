"use client";

import { AlertCircle, Check, Loader2, PlugZap, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function Loading({ label, className }: { label?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("flex items-center justify-center gap-2.5 py-12 text-sm text-fg-3", className)} role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}

/** Skeleton rows while a list loads. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-border-soft py-4">
          <div className="skeleton h-3.5 w-2/5" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Staged progress for long AI calls: shows which workflow step is likely running. */
export function AiWorking({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-5 shadow-sm", className)} role="status" aria-live="polite">
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s} className="fade-in flex items-center gap-3 text-sm" style={{ animationDelay: `${i * 0.9}s` }}>
            {i === steps.length - 1 ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            ) : (
              <Check className="size-4 shrink-0 text-fg-3" aria-hidden />
            )}
            <span className={i === steps.length - 1 ? "font-medium text-fg" : "text-fg-2"}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** v1 empty state: a dashed box with a line illustration, a title, a sentence and an optional action. */
export function EmptyState({
  title,
  text,
  action,
  icon,
  className,
  art,
  compact,
}: {
  title: string;
  text?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  art?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("ink-dashed flex flex-col items-center px-6 text-center", compact ? "py-6" : "py-10", className)}>
      {art ??
        (icon ? (
          <span className="grid size-11 place-items-center rounded-full border-[1.5px] border-ink bg-primary-soft text-fg [&_svg]:size-5" aria-hidden>
            {icon}
          </span>
        ) : (
          <EmptyBox />
        ))}
      <h3 className="mt-4 text-base font-extrabold text-fg">{title}</h3>
      {text && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fg-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** v1's "box on the conveyor", redrawn as a calm line illustration (no face). */
function EmptyBox() {
  return (
    <svg viewBox="0 0 120 64" className="h-14 w-auto" fill="none" aria-hidden>
      <path d="M38 20h44v26H38z" fill="var(--art-fill)" stroke="var(--art-ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M38 20l-6-9h44l6 9M82 20l7-8" stroke="var(--art-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M50 32h20" stroke="var(--art-brand)" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 52h92" stroke="var(--art-ink)" strokeWidth="2" strokeLinecap="round" />
      {[28, 46, 64, 82].map((x) => (
        <circle key={x} cx={x} cy="57" r="2.6" fill="var(--art-ink)" />
      ))}
    </svg>
  );
}

export function ErrorNote({ error, onRetry, className }: { error: ApiError | Error | null; onRetry?: () => void; className?: string }) {
  const { t } = useI18n();
  if (!error) return null;
  const ai = error instanceof ApiError && error.code === "ai_unavailable";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        ai ? "border-warn/30 bg-warn-soft" : "border-bad/30 bg-bad-soft",
        className,
      )}
    >
      {ai ? <PlugZap className="mt-0.5 size-4 shrink-0 text-warn" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
      <div className="min-w-0 flex-1 text-sm text-fg">
        {ai && <div className="font-medium">{t("empty.ai")}</div>}
        <p className="text-fg-2">{error.message}</p>
        {ai && (
          <Link href="/settings" className="mt-1 inline-block text-sm font-medium text-primary-text hover:underline">
            {t("nav.settings")} →
          </Link>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/** Inline notice (info / warning / success). */
export function Notice({
  tone = "info",
  title,
  children,
  className,
  icon,
}: {
  tone?: "info" | "warn" | "ok" | "bad";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  const tones = {
    info: "border-primary/20 bg-primary-soft",
    warn: "border-warn/30 bg-warn-soft",
    ok: "border-ok/30 bg-ok-soft",
    bad: "border-bad/30 bg-bad-soft",
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium text-fg">{title}</div>}
        {children && <div className="text-fg-2">{children}</div>}
      </div>
    </div>
  );
}
