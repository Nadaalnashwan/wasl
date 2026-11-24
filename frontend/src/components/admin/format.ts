/* Formatting for the admin console. Every formatter maps "no data" (null / undefined / zero sample) to N/A —
 * a missing measurement must never look like a healthy 0. */
import type { Days } from "./types";

export const NA = "N/A";

const nf = new Intl.NumberFormat("en-US");
const nfCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

type N = number | null | undefined;

/** A rate is only meaningful with a non-empty sample. Pass the denominator so 0/0 renders N/A. */
export function rateOf(value: N, sample?: number | null): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (sample !== undefined && (sample === null || sample <= 0)) return null;
  return value;
}

export function fmtPct(v: N, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  const p = v * 100;
  // keep tiny non-zero rates visible instead of rounding them to 0%
  if (p > 0 && p < 10 ** -digits) return `<${(10 ** -digits).toFixed(digits)}%`;
  return `${p.toFixed(digits)}%`;
}

export function fmtMs(v: N): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  if (v >= 60_000) return `${(v / 60_000).toFixed(1)} min`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)} s`;
  return `${Math.round(v)} ms`;
}

export function fmtNum(v: N): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  return nf.format(v);
}

export function fmtCompact(v: N): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  return Math.abs(v) < 10_000 ? nf.format(v) : nfCompact.format(v);
}

export function fmtUsd(v: N): string {
  if (v === null || v === undefined || Number.isNaN(v)) return NA;
  if (v === 0) return "$0.00";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function parse(iso: string) {
  return new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

export function fmtDateTime(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return NA;
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return NA;
  return d.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtClock(d: Date | null, locale = "en"): string {
  if (!d) return NA;
  return d.toLocaleTimeString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return NA;
  const s = Math.max(0, Math.round((Date.now() - parse(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Alert values carry different units depending on the rule key. */
export function fmtAlertValue(key: string, v: N): string {
  if (v === null || v === undefined) return NA;
  const k = key.split(":")[0];
  if (["ai_failure_rate", "provider_outage", "fallback_rate", "raw_unsupported_claims", "http_5xx"].includes(k)) return fmtPct(v);
  if (k === "p95_latency") return fmtMs(v);
  if (k === "cost_spike") return fmtUsd(v);
  if (k === "monitoring_silent") return `${v} h`;
  if (k === "eval_regression") return fmtPct(v);
  return fmtNum(v);
}

/** Generic evaluation-summary value: rates in [0,1] as %, other numbers as-is. */
export function fmtSummaryValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return NA;
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") {
    if (/rate|precision|recall|accuracy|share|score/.test(key) && v >= 0 && v <= 1) return fmtPct(v);
    return fmtNum(v);
  }
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function humanize(s: string): string {
  const t = s.replace(/[_:]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Complete UTC bucket axis for a window, matching the backend keys ("YYYY-MM-DD HH:00" hourly for ≤2 days, else "YYYY-MM-DD"). */
export function bucketAxis(days: Days | number, now = new Date()): string[] {
  const hourly = days <= 2;
  const out: string[] = [];
  const step = hourly ? 3600_000 : 86400_000;
  const end = now.getTime();
  const start = end - days * 86400_000;
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (t: number) => {
    const d = new Date(t);
    const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return hourly ? `${day} ${pad(d.getUTCHours())}:00` : day;
  };
  // align the first bucket to its boundary so keys match the backend's truncation
  let t = start - (start % step);
  while (t <= end) {
    out.push(key(t));
    t += step;
  }
  return Array.from(new Set(out));
}

export function bucketLabel(bucket: string): string {
  // "2026-11-24 13:00" -> "24 Nov 13:00"; "2026-11-24" -> "24 Nov"
  const [date, time] = bucket.split(" ");
  const [, m, d] = date.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m || 1) - 1];
  return time ? `${d} ${month} ${time}` : `${d} ${month}`;
}
