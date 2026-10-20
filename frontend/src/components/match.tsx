"use client";

import { CheckCircle2, CircleDashed, HelpCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import type { Score, SkillMatch } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ScoreGauge({ score, label }: { score: number; label: string }) {
  const angle = -90 + (Math.max(0, Math.min(100, score)) / 100) * 180;
  const color = score >= 70 ? "var(--ok)" : score >= 45 ? "var(--warn)" : "var(--bad)";
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${score}%`}>
      <svg viewBox="0 0 220 130" className="w-56" aria-hidden="true">
        <g filter="url(#rough)" fill="none" strokeLinecap="round">
          <path d="M20 115 A90 90 0 0 1 200 115" stroke="var(--paper-3)" strokeWidth="18" />
          <path d="M20 115 A90 90 0 0 1 200 115" stroke={color} strokeWidth="18" pathLength={100} strokeDasharray={`${score} 100`} />
          <path d="M20 115 A90 90 0 0 1 200 115" stroke="var(--ink)" strokeWidth="3" />
          <path d="M38 115 A72 72 0 0 1 182 115" stroke="var(--ink)" strokeWidth="2.5" />
          <g transform={`rotate(${angle} 110 115)`}>
            <path d="M110 115 L110 42" stroke="var(--ink)" strokeWidth="5" />
          </g>
          <circle cx="110" cy="115" r="9" fill="var(--sky-2)" stroke="var(--ink)" strokeWidth="3" />
        </g>
      </svg>
      <figcaption className="-mt-2 text-center">
        <div className="font-hand text-5xl leading-none">{score}%</div>
        <div className="text-sm text-ink-soft">{label}</div>
      </figcaption>
    </figure>
  );
}

export function ScoreExplain({ score }: { score: Score }) {
  const { t } = useI18n();
  const row = (name: string, d: Record<string, number>) => (
    <tr>
      <td className="py-1 pe-3 font-semibold">{name}</td>
      <td className="py-1 pe-3 text-ok">{d.verified ?? 0}</td>
      <td className="py-1 pe-3 text-warn">{d.unverified ?? 0}</td>
      <td className="py-1 text-bad">{d.missing ?? 0}</td>
    </tr>
  );
  return (
    <details className="sketch-soft bg-paper-2 p-3 text-sm">
      <summary className="cursor-pointer font-hand text-lg">{t("tailor.how")}</summary>
      <p className="mt-2 text-ink-soft">{score.formula}</p>
      <table className="mt-2">
        <thead className="text-xs text-ink-faint">
          <tr>
            <th className="pe-3 text-start"></th>
            <th className="pe-3 text-start">{t("gap.verified")}</th>
            <th className="pe-3 text-start">{t("gap.unverified")}</th>
            <th className="text-start">{t("gap.missing")}</th>
          </tr>
        </thead>
        <tbody>
          {row("Must-have (×2)", score.must_have)}
          {row("Nice-to-have (×1)", score.nice_to_have)}
        </tbody>
      </table>
      <p className="mt-2 font-semibold">
        = {score.points} / {score.max_points} points → {score.score}%
      </p>
    </details>
  );
}

const STATUS = {
  verified: { icon: CheckCircle2, cls: "bg-ok-fill", tone: "ok" as const },
  unverified: { icon: HelpCircle, cls: "bg-warn-fill", tone: "warn" as const },
  missing: { icon: XCircle, cls: "bg-bad-fill", tone: "bad" as const },
};

export function SkillColumns({ must, nice }: { must: SkillMatch[]; nice: SkillMatch[] }) {
  const { t } = useI18n();
  const all = [...must.map((m) => ({ ...m, must: true })), ...nice.map((m) => ({ ...m, must: false }))];
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(["verified", "unverified", "missing"] as const).map((st) => {
        const items = all.filter((x) => x.status === st);
        const S = STATUS[st];
        return (
          <div key={st} className={cn("sketch flex flex-col gap-3 p-4", S.cls)}>
            <div className="flex items-center gap-2">
              <S.icon className="size-5" />
              <h3 className="font-hand text-2xl">{t(`gap.${st}`)}</h3>
              <Badge className="ms-auto">{items.length}</Badge>
            </div>
            <p className="text-xs text-ink-soft">{t(`gap.${st}.d`)}</p>
            <ul className="flex flex-col gap-2">
              {items.length === 0 && (
                <li className="flex items-center gap-2 text-sm text-ink-faint">
                  <CircleDashed className="size-4" /> —
                </li>
              )}
              {items.map((m) => (
                <li key={m.skill + m.must} className="rounded-xl border-2 border-ink/20 bg-paper p-2.5">
                  <div className="flex items-center gap-2">
                    <b className="text-sm">{m.skill}</b>
                    <Badge className="ms-auto" tone={m.must ? "brand" : "neutral"}>
                      {m.must ? "must" : "nice"}
                    </Badge>
                  </div>
                  {m.sources.length > 0 && m.status === "verified" && <div className="mt-1 text-xs text-ink-soft">↳ {m.sources.join(" · ")}</div>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
