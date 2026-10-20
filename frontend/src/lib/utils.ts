import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtDate(iso?: string | null, locale = "en") {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function isArabic(text: string) {
  const ar = (text.match(/[؀-ۿ]/g) || []).length;
  return ar > text.replace(/\s/g, "").length * 0.3;
}
