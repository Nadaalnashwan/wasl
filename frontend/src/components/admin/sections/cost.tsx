"use client";

import { Receipt } from "lucide-react";
import { Notice } from "@/components/feedback";
import { Badge } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { C, HBars, SegmentBar, TimeSeries } from "../charts";
import { useFilters, useMetrics } from "../context";
import { bucketAxis, bucketLabel, fmtCompact, fmtNum, fmtUsd } from "../format";
import { Block, Definitions, FilterBar, Kpi, KpiStrip, LastUpdated, Mono, NoData, QueryGate, Sample, SectionHeader, TableWrap, td, tdNum, th, ThInfo, V } from "../primitives";
import type { CostGroup } from "../types";

function CostTable({ rows, label, keyHeader }: { rows: CostGroup[]; label: string; keyHeader: string }) {
  if (!rows.length) return <NoData />;
  const sorted = [...rows].sort((a, b) => (b.est_cost_usd ?? -1) - (a.est_cost_usd ?? -1) || b.tokens - a.tokens);
  return (
    <TableWrap label={label}>
      <thead>
        <tr>
          <th scope="col" className={th}>
            {keyHeader}
          </th>
          <ThInfo num def="est_cost">
            Est. cost
          </ThInfo>
          <ThInfo num>Tokens</ThInfo>
          <ThInfo num>Priced</ThInfo>
          <ThInfo num def="unpriced">
            Unpriced
          </ThInfo>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.key}>
            <td className={td}>
              <Mono>{r.key}</Mono>
            </td>
            <td className={tdNum}>
              <V>{fmtUsd(r.est_cost_usd)}</V>
            </td>
            <td className={tdNum}>{fmtNum(r.tokens)}</td>
            <td className={tdNum}>{fmtNum(r.priced_attempts)}</td>
            <td className={tdNum}>
              <span className={r.unpriced_attempts > 0 ? "text-warn" : undefined}>{fmtNum(r.unpriced_attempts)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function CostView() {
  const { t } = useI18n();
  const { filters } = useFilters();
  const m = useMetrics();
  const d = m.data;
  const cost = d?.cost;

  const daily = (() => {
    if (!cost) return [];
    const by = new Map(cost.daily.map((x) => [x.day, x.est_cost_usd]));
    const keys = Array.from(new Set([...bucketAxis(filters.days, new Date(), false), ...by.keys()])).sort();
    return keys.map((k) => ({ bucket: k, cost: by.has(k) ? (by.get(k) as number) : null }));
  })();
  const ks = cost ? Object.fromEntries(cost.by_key_source.map((g) => [g.key, g])) : {};

  return (
    <>
      <SectionHeader title={t("admin2.nav.cost")} sub={t("admin2.cost.sub")} right={<LastUpdated at={m.fetchedAt} loading={m.loading} onRefresh={m.reload} />} />
      <FilterBar dims={["days", "provider", "model", "task"]} options={d?.options} />
      <QueryGate queries={[m]}>
        {d && cost && (
          <div className="flex flex-col gap-10">
            <Notice tone="warn" icon={<Receipt className="text-warn" />} title="Estimate (list price × tokens, incl. retries) — not billed cost">
              Every provider attempt is priced at the list price for its model, including retries and fallbacks. Invoices can differ (free tiers, discounts, BYOK keys billed to users).
              {cost.pricing_versions.length > 0 && (
                <span className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                  Pricing tables:
                  {cost.pricing_versions.map((v) => (
                    <Badge key={v} tone="outline">
                      {v}
                    </Badge>
                  ))}
                </span>
              )}
            </Notice>

            <KpiStrip cols={5}>
              <Kpi label="Estimated cost" def="est_cost" value={fmtUsd(cost.total_est_usd)} hint="estimate" sample={<Sample n={cost.priced_attempts} unit="priced attempts" />} />
              <Kpi label="Retry & fallback share" def="retry_share" value={fmtUsd(cost.retry_and_fallback_share_usd)} />
              <Kpi label="Priced attempts" value={fmtNum(cost.priced_attempts)} />
              <Kpi label="Unpriced attempts" def="unpriced" value={fmtNum(cost.unpriced_attempts)} tone={cost.unpriced_attempts > 0 ? "warn" : undefined} hint="excluded from estimate" />
              <Kpi label="Tokens" value={fmtCompact(d.ai.total_tokens)} sample={<span className="num">{fmtNum(d.ai.attempts)} attempts</span>} />
            </KpiStrip>

            <Block title="Estimated cost per day" def="est_cost" description="UTC days. Gaps = no priced attempts that day.">
              {cost.priced_attempts === 0 ? (
                <NoData title="No priced attempts" text="No attempt in this window had both token usage and a list price." />
              ) : (
                <TimeSeries
                  rows={daily}
                  labelFormat={bucketLabel}
                  yFormat={(v) => fmtUsd(v)}
                  summary={`Estimated AI cost per day; total ${fmtUsd(cost.total_est_usd)}.`}
                  series={[{ key: "cost", name: "Estimated cost", color: C.c1, kind: "area", format: fmtUsd }]}
                />
              )}
            </Block>

            <Block title="BYOK vs platform" def="key_source" description="Who pays: users' own keys (BYOK) or Wasl's platform keys.">
              {cost.by_key_source.length === 0 ? (
                <NoData />
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4">
                    {(ks.platform?.est_cost_usd ?? 0) + (ks.byok?.est_cost_usd ?? 0) > 0 ? (
                      <SegmentBar
                        label="Estimated cost by key source"
                        format={fmtUsd}
                        parts={[
                          { key: "platform", name: "Platform (est.)", value: ks.platform?.est_cost_usd ?? 0, color: C.c1 },
                          { key: "byok", name: "BYOK (est.)", value: ks.byok?.est_cost_usd ?? 0, color: C.c2 },
                        ]}
                      />
                    ) : (
                      <p className="text-xs text-fg-3">No priced spend to split.</p>
                    )}
                    {(ks.platform?.tokens ?? 0) + (ks.byok?.tokens ?? 0) > 0 && (
                      <SegmentBar
                        label="Tokens by key source"
                        format={fmtCompact}
                        parts={[
                          { key: "platform", name: "Platform tokens", value: ks.platform?.tokens ?? 0, color: C.c1 },
                          { key: "byok", name: "BYOK tokens", value: ks.byok?.tokens ?? 0, color: C.c2 },
                        ]}
                      />
                    )}
                  </div>
                  <CostTable rows={cost.by_key_source} label="Cost by key source" keyHeader="Key source" />
                </div>
              )}
            </Block>

            <Block title="By task">
              {cost.by_task.length === 0 ? (
                <NoData />
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <HBars
                    rows={d.ai.tokens_by_task.map((r) => ({ task: r.task, prompt: r.prompt, completion: r.completion })).sort((a, b) => b.prompt + b.completion - (a.prompt + a.completion))}
                    labelKey="task"
                    labelHeader="Task"
                    stacked
                    xFormat={(v) => fmtCompact(v)}
                    summary="Input and output tokens by task."
                    series={[
                      { key: "prompt", name: "Input tokens", color: C.c1, format: fmtNum },
                      { key: "completion", name: "Output tokens", color: C.c2, format: fmtNum },
                    ]}
                  />
                  <CostTable rows={cost.by_task} label="Cost by task" keyHeader="Task" />
                </div>
              )}
            </Block>

            <div className="grid gap-8 xl:grid-cols-2">
              <Block title="By model">
                <CostTable rows={cost.by_model} label="Cost by model" keyHeader="Provider / model" />
              </Block>
              <Block title="By provider">
                <CostTable rows={cost.by_provider} label="Cost by provider" keyHeader="Provider" />
              </Block>
            </div>

            <Definitions keys={["est_cost", "unpriced", "retry_share", "key_source", "provider_attempts"]} />
          </div>
        )}
      </QueryGate>
    </>
  );
}
