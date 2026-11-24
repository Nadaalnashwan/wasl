"use client";

import { Badge } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { C, HBars, TimeSeries } from "../charts";
import { useFilters, useMetrics } from "../context";
import { bucketLabel, fmtDateTime, fmtMs, fmtNum, fmtPct, humanize, rateOf, timeRows } from "../format";
import { Block, Definitions, FilterBar, InfoTip, Kpi, KpiStrip, LastUpdated, Mono, NoData, QueryGate, Sample, SectionHeader, TableWrap, td, tdNum, th, ThInfo, V } from "../primitives";

export function AiPerformanceView() {
  const { t, locale } = useI18n();
  const { filters } = useFilters();
  const m = useMetrics();
  const d = m.data;

  return (
    <>
      <SectionHeader title={t("admin2.nav.ai")} sub={t("admin2.ai.sub")} right={<LastUpdated at={m.fetchedAt} loading={m.loading} onRefresh={m.reload} />} />
      <FilterBar dims={["days", "provider", "model", "task"]} options={d?.options} />
      <QueryGate queries={[m]}>
        {d &&
          (d.ai.attempts === 0 ? (
            <NoData />
          ) : (
            <div className="flex flex-col gap-10">
              {/* logical requests vs provider attempts, side by side */}
              <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
                <section className="bg-surface p-5" aria-labelledby="ai-logical">
                  <h2 id="ai-logical" className="flex items-center gap-1 text-sm font-semibold text-fg">
                    Logical requests <InfoTip def="logical_requests" />
                  </h2>
                  <p className="mt-0.5 text-xs text-fg-3">What users asked for — one per AI call, however many attempts it took.</p>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Kpi label="Requests" value={fmtNum(d.ai.total_requests)} />
                    <Kpi
                      label="Failure rate"
                      def="failure_rate"
                      value={fmtPct(rateOf(d.ai.failure_rate, d.ai.total_requests))}
                      sample={<Sample n={d.ai.total_requests} unit="requests" />}
                      tone={d.ai.total_requests && d.ai.failure_rate > 0.1 ? "bad" : undefined}
                    />
                    <Kpi
                      label="Fallback rate"
                      def="fallback_rate"
                      value={fmtPct(rateOf(d.ai.fallback_rate, d.ai.successful_requests))}
                      sample={<Sample n={d.ai.successful_requests} unit="successful" />}
                    />
                    <Kpi label="Retried" def="retried" value={fmtNum(d.ai.retried_requests)} />
                    <Kpi label="Redacted" def="redacted" value={fmtNum(d.ai.redacted_requests)} />
                    <Kpi label="Failed" value={fmtNum(d.ai.failed_requests)} />
                  </div>
                </section>
                <section className="bg-surface p-5" aria-labelledby="ai-attempts">
                  <h2 id="ai-attempts" className="flex items-center gap-1 text-sm font-semibold text-fg">
                    Provider attempts <InfoTip def="provider_attempts" />
                  </h2>
                  <p className="mt-0.5 text-xs text-fg-3">Every call sent to a provider, retries and fallbacks included.</p>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Kpi label="Attempts" value={fmtNum(d.ai.attempts)} />
                    <Kpi
                      label="Attempt error rate"
                      def="attempt_error_rate"
                      value={fmtPct(rateOf(d.ai.attempt_error_rate, d.ai.attempts))}
                      sample={<Sample n={d.ai.attempts} unit="attempts" />}
                    />
                    <Kpi label="Rate limits" def="rate_limits" value={fmtNum(d.ai.rate_limit_errors)} />
                    <Kpi label="Timeouts" def="timeouts" value={fmtNum(d.ai.timeout_errors)} />
                    <Kpi label="Privacy-blocked" def="privacy_blocked" value={fmtNum(d.ai.privacy_blocked_requests)} tone={d.ai.privacy_blocked_requests > 0 ? "warn" : undefined} />
                    <Kpi label="Tokens" value={fmtNum(d.ai.total_tokens)} />
                  </div>
                </section>
              </div>

              <Block title="Latency" description="Provider-attempt latency measures one call; end-to-end adds every retry and fallback the user waited through.">
                <KpiStrip cols={6}>
                  <Kpi label="Attempt p50" def="attempt_latency" value={fmtMs(d.ai.latency_ms.p50)} hint="successful attempts only" />
                  <Kpi label="Attempt p95" def="attempt_latency" value={fmtMs(d.ai.latency_ms.p95)} />
                  <Kpi label="Attempt p99" def="attempt_latency" value={fmtMs(d.ai.latency_ms.p99)} />
                  <Kpi label="Attempt average" def="attempt_latency" value={fmtMs(d.ai.latency_ms.avg)} />
                  <Kpi label="End-to-end p50" def="e2e_latency" value={fmtMs(d.ai.e2e_latency_ms.p50)} sample={<Sample n={d.ai.successful_requests} unit="requests" />} />
                  <Kpi label="End-to-end p95" def="e2e_latency" value={fmtMs(d.ai.e2e_latency_ms.p95)} />
                </KpiStrip>
              </Block>

              <Block title="End-to-end p95 over time" def="e2e_latency" description={`Per ${filters.days <= 2 ? "hour" : "day"} (UTC). Gaps = no successful requests recorded.`}>
                <TimeSeries
                  rows={timeRows(d.ai.timeseries, filters.days)}
                  labelFormat={bucketLabel}
                  yFormat={(v) => fmtMs(v)}
                  summary={`End-to-end p95 latency per bucket over ${filters.days} days.`}
                  series={[{ key: "p95_ms", name: "End-to-end p95", color: C.c1, kind: "line", format: fmtMs }]}
                />
              </Block>

              <Block title="Latency by task" description="Attempt p95 vs end-to-end p95 for each task (same unit, one axis).">
                {d.latency_by_task.length === 0 ? (
                  <NoData />
                ) : (
                  <div className="grid gap-6 xl:grid-cols-2">
                    <HBars
                      rows={d.latency_by_task.map((r) => ({ task: r.task, attempt: r.attempt_p95_ms, e2e: r.e2e_p95_ms }))}
                      labelKey="task"
                      labelHeader="Task"
                      xFormat={(v) => fmtMs(v)}
                      summary="Provider-attempt p95 and end-to-end p95 latency by task."
                      series={[
                        { key: "attempt", name: "Attempt p95", color: C.c1, format: fmtMs },
                        { key: "e2e", name: "End-to-end p95", color: C.c2, format: fmtMs },
                      ]}
                    />
                    <TableWrap label="Latency by task">
                      <thead>
                        <tr>
                          <th scope="col" className={th}>
                            Task
                          </th>
                          <ThInfo num def="attempt_latency">
                            Attempt p50
                          </ThInfo>
                          <ThInfo num def="attempt_latency">
                            Attempt p95
                          </ThInfo>
                          <ThInfo num def="e2e_latency">
                            E2E p95
                          </ThInfo>
                          <ThInfo num def="sample">
                            n
                          </ThInfo>
                        </tr>
                      </thead>
                      <tbody>
                        {d.latency_by_task.map((r) => (
                          <tr key={r.task}>
                            <td className={td}>
                              <Mono>{r.task}</Mono>
                            </td>
                            <td className={tdNum}>
                              <V>{fmtMs(r.attempt_p50_ms)}</V>
                            </td>
                            <td className={tdNum}>
                              <V>{fmtMs(r.attempt_p95_ms)}</V>
                            </td>
                            <td className={tdNum}>
                              <V>{fmtMs(r.e2e_p95_ms)}</V>
                            </td>
                            <td className={tdNum}>{fmtNum(r.requests)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  </div>
                )}
              </Block>

              <div className="grid gap-8 lg:grid-cols-2">
                <Block title="Task success (AI step)" description="Share of logical requests per task with at least one successful attempt.">
                  {d.ai.tasks.length === 0 ? (
                    <NoData />
                  ) : (
                    <TableWrap label="Task success">
                      <thead>
                        <tr>
                          <th scope="col" className={th}>
                            Task
                          </th>
                          <ThInfo num>Success rate</ThInfo>
                          <ThInfo num def="logical_requests">
                            n requests
                          </ThInfo>
                        </tr>
                      </thead>
                      <tbody>
                        {[...d.ai.tasks]
                          .sort((a, b) => b.requests - a.requests)
                          .map((r) => (
                            <tr key={r.task}>
                              <td className={td}>
                                <Mono>{r.task}</Mono>
                              </td>
                              <td className={tdNum}>
                                <span className={r.success_rate < 0.9 ? "text-warn" : undefined}>
                                  <V>{fmtPct(rateOf(r.success_rate, r.requests))}</V>
                                </span>
                              </td>
                              <td className={tdNum}>{fmtNum(r.requests)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </TableWrap>
                  )}
                </Block>
                <Block title="Workflow duration" def="workflow_duration" description="Whole user task, from task_completed events.">
                  {d.workflow_duration.length === 0 ? (
                    <NoData text="No completed workflows with a recorded duration in this window." />
                  ) : (
                    <TableWrap label="Workflow duration">
                      <thead>
                        <tr>
                          <th scope="col" className={th}>
                            Task
                          </th>
                          <ThInfo num>p50</ThInfo>
                          <ThInfo num>p95</ThInfo>
                          <ThInfo num def="sample">
                            n
                          </ThInfo>
                        </tr>
                      </thead>
                      <tbody>
                        {d.workflow_duration.map((r) => (
                          <tr key={r.task}>
                            <td className={td}>
                              <Mono>{r.task}</Mono>
                            </td>
                            <td className={tdNum}>
                              <V>{fmtMs(r.p50_ms)}</V>
                            </td>
                            <td className={tdNum}>
                              <V>{fmtMs(r.p95_ms)}</V>
                            </td>
                            <td className={tdNum}>{fmtNum(r.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  )}
                </Block>
              </div>

              <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Block title="Failed attempts by error type">
                  {Object.keys(d.ai.error_types).length === 0 ? (
                    <NoData title="No failed attempts" text="Every provider attempt in this window succeeded." />
                  ) : (
                    <HBars
                      rows={Object.entries(d.ai.error_types)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => ({ type: k, count: v }))}
                      labelKey="type"
                      labelHeader="Error type"
                      xFormat={(v) => fmtNum(v)}
                      summary={`Failed attempts by error type: ${Object.entries(d.ai.error_types)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(", ")}`}
                      series={[{ key: "count", name: "Failed attempts", color: C.bad, format: fmtNum }]}
                    />
                  )}
                </Block>
                <Block title="Recent AI failures" description="Latest 15 failed provider attempts (metadata only).">
                  {d.recent_ai_failures.length === 0 ? (
                    <NoData title="No failures" text="No failed provider attempts in this window." />
                  ) : (
                    <TableWrap label="Recent AI failures">
                      <thead>
                        <tr>
                          <th scope="col" className={th}>
                            Time
                          </th>
                          <th scope="col" className={th}>
                            Task
                          </th>
                          <th scope="col" className={th}>
                            Provider / model
                          </th>
                          <th scope="col" className={th}>
                            Error
                          </th>
                          <ThInfo num>Attempt</ThInfo>
                          <ThInfo num>Latency</ThInfo>
                        </tr>
                      </thead>
                      <tbody>
                        {d.recent_ai_failures.map((f, i) => (
                          <tr key={i}>
                            <td className={`${td} whitespace-nowrap text-fg-2`}>{fmtDateTime(f.at, locale)}</td>
                            <td className={td}>
                              <Mono>{f.task}</Mono>
                            </td>
                            <td className={`${td} text-xs`}>
                              <div className="font-medium">{f.provider}</div>
                              <div className="text-fg-3">{f.model}</div>
                            </td>
                            <td className={td}>
                              <Badge tone="bad">{humanize(f.error_type || "unknown")}</Badge>
                              {f.http_status && <span className="num ms-1.5 text-xs text-fg-3">HTTP {f.http_status}</span>}
                            </td>
                            <td className={tdNum}>{f.attempt}</td>
                            <td className={tdNum}>{fmtMs(f.latency_ms)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </TableWrap>
                  )}
                </Block>
              </div>

              <Definitions
                keys={["logical_requests", "provider_attempts", "failure_rate", "attempt_error_rate", "fallback_rate", "retried", "attempt_latency", "e2e_latency", "workflow_duration", "rate_limits", "timeouts", "privacy_blocked", "redacted", "sample"]}
              />
            </div>
          ))}
      </QueryGate>
    </>
  );
}
