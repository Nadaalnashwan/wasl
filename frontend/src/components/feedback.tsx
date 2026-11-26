"use client";

import { AlertCircle, Check, Inbox, Loader2, PlugZap, RefreshCw } from "lucide-react";
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

export function EmptyState({
  title,
  text,
  action,
  icon,
  className,
}: {
  title: string;
  text?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-4 rounded-xl border border-border-soft bg-primary-soft/45 px-5 py-4", className)}>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text ring-1 ring-primary/15 [&_svg]:size-[18px]"
        aria-hidden
      >
        {icon ?? <Inbox />}
      </span>
      <div className="min-w-0 pt-0.5">
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        {text && <p className="mt-1 max-w-lg text-sm leading-relaxed text-fg-2">{text}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
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
