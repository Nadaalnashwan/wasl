"use client";

import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge, Status } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { C, TimeSeries } from "../charts";
import { useFilters, useHealth, useMetrics } from "../context";
import { fmtAgo, fmtAlertValue, fmtDateTime, fmtMs, fmtNum, fmtPct, fmtSummaryValue, fmtUsd, bucketLabel, rateOf, timeRows } from "../format";
import { Block, Definitions, FilterBar, Kpi, KpiStrip, LastUpdated, NoData, QueryGate, Sample, SectionHeader } from "../primitives";
import { EvalKindBadge } from "./evaluation";

export function OverviewView() {
  const { t, locale } = useI18n();
  const { filters, search } = useFilters();
  const m = useMetrics();
  const h = useHealth();
  const d = m.data;
  const health = h.data;
  const refresh = () => {
    m.reload();
    h.reload();
  };
  const withQs = (href: string) => (search ? `${href}?${search}` : href);

  return (
    <>
      <SectionHeader title={t("admin2.nav.overview")} sub={t("admin2.overview.sub")} right={<LastUpdated at={m.fetchedAt} loading={m.loading || h.loading} onRefresh={refresh} />} />
      <FilterBar dims={["days", "provider", "model", "task"]} options={d?.options} />
      <QueryGate queries={[m, h]}>
        {d && health && (
          <div className="flex flex-col gap-8">
            {/* system status line */}
            <ul className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border-soft bg-surface px-4 py-3 text-xs" aria-label="System status">
              <li>
                <Status tone={health.backend === "ok" ? "ok" : "bad"}>Backend {health.backend}</Status>
              </li>
              <li>
                <Status tone={health.database.ok ? "ok" : "bad"}>
                  Database ({health.database.engine}) {health.database.ok ? "reachable" : `error: ${health.database.error ?? "unknown"}`}
                </Status>
              </li>
              <li>
                <Status tone={health.monitoring.has_data ? "neutral" : "warn"}>
                  Last AI event {fmtAgo(health.monitoring.last_ai_event)} · last HTTP event {fmtAgo(health.monitoring.last_http_event)}
                </Status>
              </li>
              <li>
                <Status tone={health.alerts.running ? "ok" : "warn"}>
                  Alert scheduler {health.alerts.running ? `running every ${health.alerts.interval_minutes} min` : "not running in-process"}
                </Status>
              </li>
              <li>
                <Status tone={health.alerts.channel === "disabled" ? "warn" : "ok"}>
                  Alert delivery {health.alerts.channel === "disabled" ? "not configured" : `via ${health.alerts.channel}`}
                </Status>
              </li>
            </ul>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-w-0 flex-col gap-8">
                <KpiStrip cols={3}>
                  <Kpi
                    label="Logical AI requests"
                    def="logical_requests"
                    value={fmtNum(d.ai.total_requests)}
                    sample={<span className="num">{fmtNum(d.ai.attempts)} provider attempts</span>}
                  />
                  <Kpi
                    label="Request failure rate"
                    def="failure_rate"
                    value={fmtPct(rateOf(d.ai.failure_rate, d.ai.total_requests))}
                    sample={<Sample n={d.ai.total_requests} unit="requests" />}
                    tone={d.ai.total_requests && d.ai.failure_rate > 0.1 ? "bad" : undefined}
                  />
                  <Kpi
                    label="End-to-end p95"
                    def="e2e_latency"
                    value={fmtMs(d.ai.e2e_latency_ms.p95)}
                    sample={<Sample n={d.ai.successful_requests} unit="successful requests" />}
                  />
                  <Kpi
                    label="Raw unsupported claim rate"
                    def="raw_unsupported"
                    value={fmtPct(d.quality.claims_by_stage.raw.unsupported_rate)}
                    sample={<Sample n={d.quality.claims_by_stage.raw.claims_checked} unit="claims" />}
                  />
                  <Kpi
                    label="Escaped unsupported claims"
                    def="escaped"
                    value={fmtNum(d.quality.unsupported_escaped)}
                    tone={d.quality.unsupported_escaped > 0 ? "bad" : undefined}
                    sample={<Sample n={d.quality.claims_by_stage.approved.claims_checked + d.quality.claims_by_stage.final.claims_checked} unit="claims checked" />}
                  />
                  <Kpi
                    label="Estimated AI cost"
                    def="est_cost"
                    value={fmtUsd(d.cost.total_est_usd)}
                    hint={<span>estimate, not billed</span>}
                    sample={<Sample n={d.cost.priced_attempts} unit="priced attempts" />}
                  />
                </KpiStrip>

                <Block title="AI request volume" def="logical_requests" description={`Logical requests per ${filters.days <= 2 ? "hour" : "day"} (UTC). Gaps = nothing recorded.`}>
                  {d.ai.total_requests === 0 ? (
                    <NoData />
                  ) : (
                    <TimeSeries
                      rows={timeRows(d.ai.timeseries, filters.days)}
                      labelFormat={bucketLabel}
                      yFormat={(v) => fmtNum(v)}
                      summary={`AI request volume over ${filters.days} days: ${d.ai.total_requests} logical requests, ${d.ai.failed_requests} failed.`}
                      series={[
                        { key: "requests", name: "Logical requests", color: C.c1, kind: "area", format: fmtNum },
                        { key: "failed", name: "Failed requests", color: C.bad, kind: "line", format: fmtNum },
                      ]}
                    />
                  )}
                </Block>

                <Block title="End-to-end p95 latency" def="e2e_latency" description="p95 of successful logical requests in each bucket, retries and fallbacks included.">
                  {d.ai.successful_requests === 0 ? (
                    <NoData />
                  ) : (
                    <TimeSeries
                      rows={timeRows(d.ai.timeseries, filters.days)}
                      labelFormat={bucketLabel}
                      yFormat={(v) => fmtMs(v)}
                      summary={`End-to-end p95 latency per bucket; overall p95 ${fmtMs(d.ai.e2e_latency_ms.p95)}.`}
                      series={[{ key: "p95_ms", name: "End-to-end p95", color: C.c1, kind: "line", format: fmtMs }]}
                    />
                  )}
                </Block>
              </div>

              <aside className="flex min-w-0 flex-col gap-8" aria-label="Attention">
                <Block
                  title="Firing in this window"
                  description="Alert rules evaluated live against the selected window and filters."
                  action={
                    <Link href="/admin/monitoring/alerts" className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline">
                      Incidents <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
                    </Link>
                  }
                >
                  {d.alerts.length === 0 ? (
                    <p className="flex items-start gap-2 rounded-lg border border-border-soft bg-surface px-4 py-3 text-sm text-fg-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                      No rule is firing. Rules need at least the minimum sample before they can fire.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border-soft bg-surface">
                      {d.alerts.map((a) => (
                        <li key={a.key} className="flex gap-3 px-4 py-3">
                          {a.level === "critical" ? (
                            <AlertOctagon className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
                          ) : (
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                          )}
                          <div className="min-w-0 text-sm">
                            <div className="font-medium text-fg">
                              <span className="sr-only">{a.level}: </span>
                              {a.title}
                            </div>
                            <div className="num mt-0.5 text-xs text-fg-2">
                              {fmtAlertValue(a.key, a.value)} vs threshold {fmtAlertValue(a.key, a.threshold)} · n = {fmtNum(a.sample_size)}
                            </div>
                            <p className="mt-1 text-xs text-fg-3">{a.investigate}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>

                <Block
                  title="Latest evaluation"
                  action={
                    <Link href="/admin/monitoring/evaluation" className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline">
                      All runs <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
                    </Link>
                  }
                >
                  {!d.latest_eval ? (
                    <p className="border-s-2 border-border py-1 ps-4 text-sm text-fg-3">No evaluation run has been recorded. Scores appear only after a real run.</p>
                  ) : (
                    <div className="rounded-lg border border-border-soft bg-surface px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <EvalKindBadge kind={d.latest_eval.kind} />
                        <span className="text-xs text-fg-3">{fmtDateTime(d.latest_eval.at, locale)}</span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                        <dt className="text-fg-3">Task success</dt>
                        <dd className="num text-end font-medium text-fg">{fmtSummaryValue("task_success_rate", d.latest_eval.summary.task_success_rate)}</dd>
                        <dt className="text-fg-3">Cases</dt>
                        <dd className="num text-end text-fg">{fmtSummaryValue("cases", d.latest_eval.summary.cases)}</dd>
                        <dt className="text-fg-3">Dataset</dt>
                        <dd className="text-end text-fg">{d.latest_eval.dataset_version}</dd>
                      </dl>
                    </div>
                  )}
                </Block>

                <Block
                  title="HTTP"
                  def="http_5xx"
                  action={
                    <Link href={withQs("/admin/monitoring/health")} className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline">
                      Health <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
                    </Link>
                  }
                >
                  <dl className="grid grid-cols-2 gap-y-2 rounded-lg border border-border-soft bg-surface px-4 py-3 text-xs">
                    <dt className="text-fg-3">Requests</dt>
                    <dd className="num text-end text-fg">{fmtNum(d.http.requests)}</dd>
                    <dt className="text-fg-3">5xx rate</dt>
                    <dd className="num text-end text-fg">{fmtPct(rateOf(d.http.error_rate_5xx, d.http.requests))}</dd>
                    <dt className="text-fg-3">p95 latency</dt>
                    <dd className="num text-end text-fg">{fmtMs(d.http.p95_ms)}</dd>
                  </dl>
                  {(filters.provider || filters.model || filters.task) && (
                    <p className="mt-2 text-xs text-fg-3">
                      <Badge tone="outline">note</Badge> HTTP metrics are not affected by provider/model/task filters.
                    </p>
                  )}
                </Block>
              </aside>
            </div>

            <Definitions keys={["logical_requests", "provider_attempts", "failure_rate", "e2e_latency", "raw_unsupported", "escaped", "est_cost", "sample"]} />
          </div>
        )}
      </QueryGate>
    </>
  );
}
