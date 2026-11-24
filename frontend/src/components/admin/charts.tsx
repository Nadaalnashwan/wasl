"use client";

/* Restrained, labelled charts for the admin console (Recharts).
 * - colours come from tokens (--chart-1..4, status --bad); text always uses text tokens
 * - one y-axis per chart; time series use a complete bucket axis with gaps (null) where nothing was recorded —
 *   missing buckets are never drawn as fabricated zeros
 * - every chart has a legend (≥2 series), a hover tooltip and a "View as table" fallback */

import * as React from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NA } from "./format";
import { V } from "./primitives";

export const C = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  bad: "var(--bad)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  muted: "var(--border-strong)",
};

const axisTick = { fill: "var(--text-3)", fontSize: 11 };

export type Series = {
  key: string;
  name: string;
  color: string;
  kind?: "area" | "line" | "bar";
  format: (v: number | null) => string;
};

type Row = Record<string, string | number | null>;

/* ------------------------------------------------------------------ legend + tooltip */

export function Legend({ series, className }: { series: Pick<Series, "key" | "name" | "color" | "kind">[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-2", className)} aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          {s.kind === "line" ? (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          )}
          {s.name}
        </li>
      ))}
    </ul>
  );
}

type TipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  series: Series[];
  labelFormat?: (l: string) => string;
};

function Tip({ active, label, payload, series, labelFormat }: TipProps) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(payload.map((p) => [String(p.dataKey), p.value]));
  const empty = series.every((s) => byKey.get(s.key) === null || byKey.get(s.key) === undefined);
  return (
    <div className="min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md" dir="ltr">
      <div className="mb-1 font-medium text-fg">{labelFormat ? labelFormat(String(label)) : label}</div>
      {empty ? (
        <div className="text-fg-3">No recorded events</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {series.map((s) => {
            const v = byKey.get(s.key);
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="text-fg-2">{s.name}</span>
                <span className="num ms-auto ps-3 font-medium text-fg">{s.format(typeof v === "number" ? v : null)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ frame with table view */

export function ChartFrame({
  summary,
  series,
  rows,
  labelKey,
  labelHeader,
  labelFormat,
  height,
  children,
}: {
  summary: string;
  series: Series[];
  rows: Row[];
  labelKey: string;
  labelHeader: string;
  labelFormat?: (l: string) => string;
  height: number;
  children: React.ReactElement;
}) {
  const { t } = useI18n();
  return (
    <figure className="min-w-0">
      <Legend series={series} className="mb-2" />
      <div role="img" aria-label={summary} style={{ height }} dir="ltr" className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-fg-3 hover:text-fg">{t("admin2.tableView")}</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-start font-medium text-fg-3">
                  {labelHeader}
                </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-1.5 text-end font-medium text-fg-3">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 text-start font-normal text-fg-2">
                    {labelFormat ? labelFormat(String(r[labelKey])) : String(r[labelKey])}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-end">
                      <V>{typeof r[s.key] === "number" ? s.format(r[s.key] as number) : NA}</V>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/* ------------------------------------------------------------------ time series (area + line on one axis) */

export function TimeSeries({
  rows,
  series,
  summary,
  yFormat,
  labelFormat,
  height = 220,
}: {
  rows: Row[]; // must contain "bucket" and one numeric-or-null field per series
  series: Series[];
  summary: string;
  yFormat: (v: number) => string;
  labelFormat: (l: string) => string;
  height?: number;
}) {
  // draw a dot where a value has no neighbours, otherwise an isolated point would be invisible
  const isolated = (key: string, i: number) => {
    const has = (j: number) => j >= 0 && j < rows.length && typeof rows[j][key] === "number";
    return has(i) && !has(i - 1) && !has(i + 1);
  };
  const dotFor = (s: Series) =>
    function Dot(props: { cx?: number; cy?: number; index?: number }) {
      const { cx, cy, index = -1 } = props;
      if (cx === undefined || cy === undefined || !isolated(s.key, index)) return <g key={`${s.key}-${index}`} />;
      return <circle key={`${s.key}-${index}`} cx={cx} cy={cy} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
    };
  return (
    <ChartFrame summary={summary} series={series} rows={rows} labelKey="bucket" labelHeader="Period (UTC)" labelFormat={labelFormat} height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={labelFormat} minTickGap={28} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={yFormat} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          content={(p) => <Tip active={p.active} label={p.label} payload={p.payload} series={series} labelFormat={labelFormat} />}
        />
        {series.map((s) =>
          s.kind === "line" ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={dotFor(s)}
              activeDot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.1}
              dot={dotFor(s)}
              activeDot={{ r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ),
        )}
      </ComposedChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ horizontal bars (distributions, per-category) */

export function HBars({
  rows,
  labelKey,
  labelHeader,
  series,
  summary,
  xFormat,
  stacked,
}: {
  rows: Row[];
  labelKey: string;
  labelHeader: string;
  series: Series[];
  summary: string;
  xFormat: (v: number) => string;
  stacked?: boolean;
}) {
  const perRow = stacked || series.length === 1 ? 30 : 16 * series.length + 14;
  const height = Math.max(120, rows.length * perRow + 36);
  const longest = Math.max(...rows.map((r) => String(r[labelKey]).length), 4);
  return (
    <ChartFrame summary={summary} series={series} rows={rows} labelKey={labelKey} labelHeader={labelHeader} height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={stacked || series.length === 1 ? "28%" : "18%"}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={xFormat} allowDecimals={false} />
        <YAxis type="category" dataKey={labelKey} tick={axisTick} tickLine={false} axisLine={false} width={Math.min(180, longest * 6.6 + 12)} />
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          content={(p) => <Tip active={p.active} label={p.label} payload={p.payload} series={series} />}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color}
            stackId={stacked ? "s" : undefined}
            maxBarSize={stacked || series.length === 1 ? 16 : 12}
            radius={!stacked || i === series.length - 1 ? [0, 4, 4, 0] : 0}
            stroke={stacked ? "var(--surface)" : undefined}
            strokeWidth={stacked ? 2 : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ segmented bar (one whole, split into parts) */

export function SegmentBar({ parts, label, format = (v) => v.toLocaleString("en-US") }: { parts: { key: string; name: string; value: number; color: string }[]; label: string; format?: (v: number) => string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const desc = parts.map((p) => `${p.name} ${format(p.value)} (${Math.round((p.value / total) * 100)}%)`).join(", ");
  return (
    <figure className="min-w-0">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${label}: ${desc}`}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.key} className="h-full first:rounded-s-full last:rounded-e-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.name}: ${format(p.value)}`} />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
            {p.name}
            <span className="num font-medium text-fg">{format(p.value)}</span>
            <span className="num text-fg-3">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
