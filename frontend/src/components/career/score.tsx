"use client";

import { useI18n } from "@/lib/i18n";
import type { Score, SkillMatch } from "@/lib/types";
import { cn } from "@/lib/utils";

const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

const STATUS_BAR = { verified: "bg-ok", unverified: "bg-warn", missing: "bg-bad" } as const;

/** The score as a number plus a bar of requirement statuses (real counts, no gauge). */
export function ScoreSummary({
  score,
  label,
  must,
  nice,
  className,
}: {
  score: number | null | undefined;
  label: string;
  must: SkillMatch[];
  nice: SkillMatch[];
  className?: string;
}) {
  const { t } = useI18n();
  const all = [...must, ...nice];
  const counts = (["verified", "unverified", "missing"] as const).map((s) => ({ s, n: all.filter((m) => m.status === s).length }));
  const total = all.length;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline gap-3">
        <span className="num text-[44px] leading-none font-semibold tracking-tight text-fg rtl:tracking-normal">
          {score ?? "—"}
          {score != null && <span className="text-2xl text-fg-3">%</span>}
        </span>
        <span className="text-sm text-fg-2">{label}</span>
      </div>
      {total > 0 && (
        <>
          <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
            {counts.map(({ s, n }) => (n ? <span key={s} className={cn("h-full", STATUS_BAR[s])} style={{ width: `${(n / total) * 100}%` }} /> : null))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
            {counts.map(({ s, n }) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", STATUS_BAR[s])} aria-hidden />
                <span className="num font-medium text-fg">{n}</span> {t(`career2.status.${s}`)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Plain-language explanation of result.score (backend app/ai/skills.py match_score). */
export function ScoreExplain({ score, className, open }: { score: Score; className?: string; open?: boolean }) {
  const { t } = useI18n();
  const row = (name: string, d: Record<string, number>, weight: number) => {
    const v = d.verified ?? 0;
    const u = d.unverified ?? 0;
    const m = d.missing ?? 0;
    const earned = weight * (v + 0.5 * u);
    const max = weight * (v + u + m);
    return (
      <tr className="border-t border-border">
        <th scope="row" className="py-2 pe-3 text-start font-medium text-fg">
          {name}
        </th>
        <td className="num py-2 pe-3 text-ok">{v}</td>
        <td className="num py-2 pe-3 text-warn">{u}</td>
        <td className="num py-2 pe-3 text-bad">{m}</td>
        <td className="num py-2 text-end text-fg">
          {Number.isInteger(earned) ? earned : earned.toFixed(1)} / {max}
        </td>
      </tr>
    );
  };
  return (
    <details className={cn("group rounded-xl border border-border bg-surface shadow-sm", className)} open={open}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-fg marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          {t("career2.score.how")}
          <span className="text-xs font-normal text-primary-text group-open:hidden">{t("career2.score.show")}</span>
        </span>
      </summary>
      <div className="border-t border-border px-4 py-4 text-sm leading-relaxed text-fg-2">
        {score.max_points === 0 ? (
          <p>{t("career2.score.none")}</p>
        ) : (
          <>
            <ol className="flex list-decimal flex-col gap-1.5 ps-5">
              <li>{t("career2.score.p1")}</li>
              <li>{t("career2.score.p2")}</li>
              <li>{fill(t("career2.score.p3"), { points: score.points, max: score.max_points, score: score.score })}</li>
            </ol>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[18rem] text-xs">
                <thead className="text-fg-3">
                  <tr>
                    <th scope="col" className="pb-1.5 pe-3 text-start font-medium">
                      <span className="sr-only">{t("career2.score.req")}</span>
                    </th>
                    <th scope="col" className="pb-1.5 pe-3 text-start font-medium">
                      {t("career2.status.verified")}
                    </th>
                    <th scope="col" className="pb-1.5 pe-3 text-start font-medium">
                      {t("career2.status.unverified")}
                    </th>
                    <th scope="col" className="pb-1.5 pe-3 text-start font-medium">
                      {t("career2.status.missing")}
                    </th>
                    <th scope="col" className="pb-1.5 text-end font-medium">
                      {t("career2.score.points")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {row(t("career2.score.mustRow"), score.must_have, 2)}
                  {row(t("career2.score.niceRow"), score.nice_to_have, 1)}
                  <tr className="border-t border-border-strong">
                    <th scope="row" colSpan={4} className="py-2 text-start font-semibold text-fg">
                      {t("career2.score.total")}
                    </th>
                    <td className="num py-2 text-end font-semibold text-fg">
                      {score.points} / {score.max_points} = {score.score}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono text-[11px] break-words text-fg-3" dir="ltr">
              {score.formula}
            </p>
          </>
        )}
        <p className="mt-3 text-xs text-fg-3">{t("career2.score.caveat")}</p>
      </div>
    </details>
  );
}
