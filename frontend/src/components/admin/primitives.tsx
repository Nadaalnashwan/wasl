"use client";

import { HelpCircle, RefreshCw } from "lucide-react";
import * as React from "react";
import { ErrorNote, EmptyState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/card";
import { Segmented, Select } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/overlay";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFilters, type Query } from "./context";
import { DEFS, type DefKey } from "./definitions";
import { fmtClock, humanize, NA } from "./format";
import type { Days, Metrics } from "./types";

/* ------------------------------------------------------------------ definitions */

/** "How it's calculated" — a focusable info button with a tooltip (keyboard + screen reader reachable). */
export function InfoTip({ def, text }: { def?: DefKey; text?: string }) {
  const content = text ?? (def ? DEFS[def] : "");
  if (!content) return null;
  return (
    <Tooltip content={content}>
      <button
        type="button"
        className="inline-grid size-5 shrink-0 place-items-center rounded text-fg-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)]"
        aria-label={`How it's calculated: ${content}`}
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}

/** Collapsible definition list at the foot of a section. */
export function Definitions({ keys, className }: { keys: DefKey[]; className?: string }) {
  const { t } = useI18n();
  return (
    <details className={cn("group rounded-lg border border-border-soft bg-surface", className)}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <HelpCircle className="size-4 text-fg-3" aria-hidden /> {t("admin2.definitions")}
        </span>
      </summary>
      <dl className="grid gap-x-8 gap-y-3 border-t border-border px-4 py-4 text-sm md:grid-cols-2" dir="ltr">
        {keys.map((k) => (
          <div key={k} className="min-w-0">
            <dt className="font-medium text-fg">{humanize(k)}</dt>
            <dd className="mt-0.5 text-fg-2">{DEFS[k]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/* ------------------------------------------------------------------ metrics */

export function Sample({ n, unit }: { n: number | null | undefined; unit: string }) {
  if (n === null || n === undefined) return null;
  return (
    <span className="num text-xs text-fg-3">
      n = {n.toLocaleString("en-US")} {unit}
    </span>
  );
}

/** One metric in a hairline strip: label + definition, value, sample size. */
export function Kpi({
  label,
  value,
  def,
  sample,
  hint,
  tone,
}: {
  label: string;
  value: string;
  def?: DefKey;
  sample?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
}) {
  const na = value === NA;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-xs font-medium text-fg-3">
        <span className="truncate">{label}</span>
        {def && <InfoTip def={def} />}
      </div>
      <div
        className={cn(
          "num mt-1 text-2xl font-semibold tracking-tight",
          na ? "text-fg-3" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg",
        )}
      >
        {na ? <NaValue /> : value}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-3">
        {sample}
        {hint}
      </div>
    </div>
  );
}

export function NaValue({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cn("text-fg-3", className)} title={t("admin2.na")}>
      {NA}
      <span className="sr-only"> — {t("admin2.na")}</span>
    </span>
  );
}

/** Inline value for tables: N/A renders muted. */
export function V({ children, className }: { children: string; className?: string }) {
  if (children === NA) return <NaValue className={className} />;
  return <span className={cn("num", className)}>{children}</span>;
}

/** Hairline strip of KPIs (not boxed cards). */
export function KpiStrip({ children, cols = 4, className }: { children: React.ReactNode; cols?: 3 | 4 | 5 | 6; className?: string }) {
  const grid = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols];
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border min-[420px]:grid-cols-2 [&>*]:bg-surface [&>*]:px-4 [&>*]:py-3.5",
        grid,
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

export function TableWrap({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border-soft bg-surface", className)} role="region" aria-label={label} tabIndex={label ? 0 : undefined}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export const th = "border-b border-border bg-surface-2/60 px-3 py-2 text-start text-xs font-medium whitespace-nowrap text-fg-3";
export const thNum = cn(th, "text-end");
export const td = "border-b border-border px-3 py-2.5 align-top text-fg last:border-b-0 [tr:last-child>&]:border-b-0";
export const tdNum = cn(td, "num text-end whitespace-nowrap");

export function ThInfo({ children, def, num }: { children: React.ReactNode; def?: DefKey; num?: boolean }) {
  return (
    <th scope="col" className={num ? thNum : th}>
      <span className={cn("inline-flex items-center gap-1", num && "flex-row-reverse")}>
        {children}
        {def && <InfoTip def={def} />}
      </span>
    </th>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <code className={cn("rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-fg-2 break-all", className)}>{children}</code>;
}

export function ToneBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}

/* ------------------------------------------------------------------ page scaffolding */

export function LastUpdated({ at, loading, onRefresh }: { at: Date | null; loading: boolean; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-fg-3" aria-live="polite">
        {loading ? (
          t("admin2.updating")
        ) : (
          <>
            {t("admin2.updated")} <time className="num text-fg-2">{fmtClock(at, locale)}</time>
          </>
        )}
      </span>
      <Button size="sm" variant="secondary" onClick={onRefresh} loading={loading} aria-label={t("admin2.refresh")}>
        {!loading && <RefreshCw aria-hidden />}
        {t("admin2.refresh")}
      </Button>
    </div>
  );
}

export type FilterDim = "days" | "provider" | "model" | "task";

/** One row of filters above the content; values live in the URL. */
export function FilterBar({ dims, options, note }: { dims: FilterDim[]; options?: Metrics["options"] | null; note?: React.ReactNode }) {
  const { t } = useI18n();
  const { filters, setFilters } = useFilters();
  const days: { value: string; label: string }[] = [
    { value: "1", label: t("admin2.f.d1") },
    { value: "7", label: t("admin2.f.d7") },
    { value: "30", label: t("admin2.f.d30") },
    { value: "90", label: t("admin2.f.d90") },
  ];
  const active = (dims.includes("provider") && filters.provider) || (dims.includes("model") && filters.model) || (dims.includes("task") && filters.task);
  const select = (dim: "provider" | "model" | "task", all: string, list: string[] | undefined) => {
    const value = filters[dim];
    const opts = Array.from(new Set([...(list ?? []), ...(value ? [value] : [])])).sort();
    return (
      <Select
        aria-label={t(`admin2.f.${dim}`)}
        value={value ?? ""}
        onChange={(e) => setFilters({ [dim]: e.target.value || null })}
        className="h-8 w-auto max-w-[14rem] text-xs"
      >
        <option value="">{all}</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  };
  return (
    <div className="mb-6 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {dims.includes("days") && (
          <Segmented size="sm" ariaLabel={t("admin2.f.range")} value={String(filters.days)} onChange={(v) => setFilters({ days: Number(v) as Days })} options={days} />
        )}
        {dims.includes("provider") && select("provider", t("admin2.f.allProviders"), options?.providers)}
        {dims.includes("model") && select("model", t("admin2.f.allModels"), options?.models)}
        {dims.includes("task") && select("task", t("admin2.f.allTasks"), options?.tasks)}
        {active && (
          <Button size="xs" variant="ghost" onClick={() => setFilters({ provider: null, model: null, task: null })}>
            {t("admin2.f.clear")}
          </Button>
        )}
      </div>
      {note && <p className="text-xs text-fg-3">{note}</p>}
    </div>
  );
}

export function SectionHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-title font-semibold text-fg">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-fg-2">{sub}</p>
      </div>
      {right}
    </header>
  );
}

/** Loading / error wrapper for one or more queries. Never renders children with partial or failed data. */
export function QueryGate({ queries, children, skeleton = 3 }: { queries: Query<unknown>[]; children: React.ReactNode; skeleton?: number }) {
  const failed = queries.find((q) => q.error);
  const first = queries.some((q) => q.data === null && q.loading);
  if (failed?.error) {
    const e = failed.error;
    if (e instanceof ApiError && (e.status === 403 || e.status === 401)) return null; // the shell shows the denied screen
    return <ErrorNote error={e} onRetry={() => queries.forEach((q) => q.reload())} />;
  }
  if (first || queries.some((q) => q.data === null)) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-label="Loading">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 bg-surface p-4">
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton h-6 w-2/3" />
            </div>
          ))}
        </div>
        {Array.from({ length: skeleton }).map((_, i) => (
          <div key={i} className="skeleton h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  const busy = queries.some((q) => q.loading);
  return (
    <div aria-busy={busy || undefined} className={cn("transition-opacity", busy && "opacity-60")}>
      {children}
    </div>
  );
}

export function NoData({ text, title }: { text?: string; title?: string }) {
  const { t } = useI18n();
  return <EmptyState title={title ?? t("admin2.empty.title")} text={text ?? t("admin2.empty.text")} />;
}

/** Sub-section block used inside admin pages (heading + optional definition + description). */
export function Block({
  title,
  def,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  def?: DefKey;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <h2 id={id} className="flex items-center gap-1 text-heading font-semibold text-fg">
            {title}
            {def && <InfoTip def={def} />}
          </h2>
          {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
