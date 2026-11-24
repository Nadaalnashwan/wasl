"use client";

import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Analysis, SkillMatch } from "@/lib/types";
import { cn } from "@/lib/utils";

export type MatchStatus = SkillMatch["status"];

export const STATUS_META: Record<MatchStatus, { icon: React.ElementType; tone: string; label: TKey; desc: TKey }> = {
  verified: { icon: CheckCircle2, tone: "text-ok", label: "career2.status.verified", desc: "career2.status.verified.d" },
  unverified: { icon: CircleHelp, tone: "text-warn", label: "career2.status.unverified", desc: "career2.status.unverified.d" },
  missing: { icon: XCircle, tone: "text-bad", label: "career2.status.missing", desc: "career2.status.missing.d" },
};

const SOURCE_KIND: Record<string, TKey> = {
  experience: "career2.src.experience",
  project: "career2.src.project",
  certification: "career2.src.certification",
  education: "career2.src.education",
  achievement: "career2.src.achievement",
};

const KIND: Record<string, TKey> = {
  soft: "career2.kind.soft",
  domain: "career2.kind.domain",
  credential: "career2.kind.credential",
  experience: "career2.kind.experience",
};

/** Evidence source label from the backend ("project: Wasl", "experience: Dev @ Org", "skills list"). */
export function SourceTag({ source }: { source: string }) {
  const { t } = useI18n();
  const idx = source.indexOf(":");
  const kind = idx > 0 ? source.slice(0, idx).trim().toLowerCase() : "";
  const name = idx > 0 ? source.slice(idx + 1).trim() : source;
  if (source === "skills list") return <span className="text-xs text-fg-3">{t("career2.src.skillsList")}</span>;
  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 text-xs">
      {SOURCE_KIND[kind] && <span className="shrink-0 font-medium text-fg-3">{t(SOURCE_KIND[kind])}</span>}
      <span className="min-w-0 break-words text-fg-2" dir="auto">
        {name.replace(/\s*@\s*$/, "") || "—"}
      </span>
    </span>
  );
}

/** Step: what the AI extracted from the job description. */
export function RequirementsList({ req }: { req: Analysis["requirements"] }) {
  const { t } = useI18n();
  const block = (title: string, items: { skill: string; kind: string }[]) => (
    <div className="min-w-0">
      <h3 className="mb-2 text-xs font-semibold text-fg-3">
        {title} <span className="num font-normal">({items.length})</span>
      </h3>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((r, i) => (
            <li key={r.skill + i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg" dir="auto">
              {r.skill}
              {KIND[r.kind] && <span className="text-[11px] text-fg-3">{t(KIND[r.kind])}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">{t("career2.req.none")}</p>
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        {[
          [t("career2.req.title"), req.job_title],
          [t("career2.req.company"), req.company],
          [t("career2.req.seniority"), req.seniority],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-fg-3">{k}</dt>
            <dd className="mt-0.5 font-medium break-words text-fg" dir="auto">
              {v || "—"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 md:grid-cols-2">
        {block(t("career2.req.must"), req.must_have ?? [])}
        {block(t("career2.req.nice"), req.nice_to_have ?? [])}
      </div>
      {req.responsibilities?.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold text-fg-3">{t("career2.req.resp")}</h3>
          <ul className="list-disc space-y-1 ps-5 text-sm text-fg-2 marker:text-fg-3">
            {req.responsibilities.map((r, i) => (
              <li key={i} dir="auto">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Step: every requirement against the evidence in the CV, with sources. */
export function EvidenceMatrix({ must, nice }: { must: SkillMatch[]; nice: SkillMatch[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = React.useState<"all" | MatchStatus>("all");
  const rows = [...must.map((m) => ({ ...m, must: true })), ...nice.map((m) => ({ ...m, must: false }))];
  const count = (s: MatchStatus) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  if (!rows.length) return <p className="text-sm text-fg-3">{t("career2.req.none")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        ariaLabel={t("career2.match.filter")}
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `${t("career2.match.all")} ${rows.length}` },
          { value: "verified", label: `${t("career2.status.verified")} ${count("verified")}` },
          { value: "unverified", label: `${t("career2.status.unverified")} ${count("unverified")}` },
          { value: "missing", label: `${t("career2.status.missing")} ${count("missing")}` },
        ]}
      />
      <div className="overflow-hidden rounded-lg border border-border-soft bg-surface">
        <div className="hidden grid-cols-[minmax(0,1.1fr)_7.5rem_minmax(0,1.6fr)] gap-4 border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-medium text-fg-3 md:grid" aria-hidden>
          <span>{t("career2.match.req")}</span>
          <span>{t("career2.match.status")}</span>
          <span>{t("career2.match.evidence")}</span>
        </div>
        <ul className="divide-y divide-border" aria-live="polite">
          {shown.map((r, i) => {
            const S = STATUS_META[r.status];
            return (
              <li key={r.skill + r.must + i} className="grid gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_7.5rem_minmax(0,1.6fr)]">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium break-words text-fg" dir="auto">
                    {r.skill}
                  </span>
                  <Badge tone={r.must ? "brand" : "neutral"}>{r.must ? t("career2.req.mustShort") : t("career2.req.niceShort")}</Badge>
                </div>
                <div className={cn("flex items-center gap-1.5 text-xs font-medium", S.tone)}>
                  <S.icon className="size-3.5 shrink-0" aria-hidden />
                  {t(S.label)}
                </div>
                <div className="min-w-0">
                  {r.status === "verified" && r.sources.length > 0 ? (
                    <ul className="flex flex-col gap-0.5">
                      {r.sources.map((s, j) => (
                        <li key={j}>
                          <SourceTag source={s} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-fg-3">{r.status === "unverified" ? t("career2.match.onlyListed") : t("career2.match.noEvidence")}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <ul className="grid gap-2 text-xs text-fg-3 sm:grid-cols-3">
        {(["verified", "unverified", "missing"] as const).map((s) => (
          <li key={s}>
            <span className={cn("font-medium", STATUS_META[s].tone)}>{t(STATUS_META[s].label)}</span> — {t(STATUS_META[s].desc)}
          </li>
        ))}
      </ul>
    </div>
  );
}
