"use client";

import { Badge, DescriptionList, Status } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { C, HBars } from "../charts";
import { useAdminQuery, useFilters, useHealth, useMetrics } from "../context";
import { fmtAgo, fmtDateTime, fmtMs, fmtNum, fmtPct, rateOf } from "../format";
import { Block, Definitions, FilterBar, Kpi, KpiStrip, LastUpdated, Mono, NoData, QueryGate, Sample, SectionHeader, TableWrap, td, tdNum, th, ThInfo, V } from "../primitives";
import type { ErrorsResponse, RouteStat } from "../types";

function RoutesTable({ rows, label }: { rows: RouteStat[]; label: string }) {
  if (!rows.length) return <NoData />;
  return (
    <TableWrap label={label}>
      <thead>
        <tr>
          <th scope="col" className={th}>
            Route
          </th>
          <ThInfo num>Requests</ThInfo>
          <ThInfo num def="http_5xx">
            5xx
          </ThInfo>
          <ThInfo num def="http_latency">
            p95
          </ThInfo>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.route}>
            <td className={td}>
              <Mono>{r.route}</Mono>
            </td>
            <td className={tdNum}>{fmtNum(r.count)}</td>
            <td className={tdNum}>
              <span className={r.errors_5xx > 0 ? "text-bad" : undefined}>{fmtNum(r.errors_5xx)}</span>
            </td>
            <td className={tdNum}>
              <V>{fmtMs(r.p95_ms)}</V>
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function HealthView() {
  const { t, locale } = useI18n();
  const { filters } = useFilters();
  const h = useHealth();
  const m = useMetrics({});
  const e = useAdminQuery<ErrorsResponse>(`/api/admin/monitoring/errors?days=${filters.days}`);
  const refresh = () => {
    h.reload();
    m.reload();
    e.reload();
  };
  const health = h.data;
  const http = m.data?.http;
  const statusRows = http ? Object.entries(http.status_distribution).map(([k, v]) => ({ status: k, count: v })) : [];

  return (
    <>
      <SectionHeader title={t("admin2.nav.health")} sub={t("admin2.health.sub")} right={<LastUpdated at={m.fetchedAt} loading={h.loading || m.loading || e.loading} onRefresh={refresh} />} />
      <FilterBar dims={["days"]} note="Provider, model and task filters do not apply to HTTP traffic." />
      <QueryGate queries={[h, m, e]}>
        {health && http && e.data && (
          <div className="flex flex-col gap-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Block title="Runtime" description={`Checked ${fmtDateTime(health.checked_at, locale)}`}>
                <DescriptionList
                  className="rounded-xl border border-border bg-surface shadow-sm p-4"
                  items={[
                    { label: "Backend", value: <Status tone={health.backend === "ok" ? "ok" : "bad"}>{health.backend}</Status> },
                    {
                      label: "Database",
                      value: (
                        <Status tone={health.database.ok ? "ok" : "bad"}>
                          {health.database.engine} — {health.database.ok ? "reachable" : `error: ${health.database.error ?? "unknown"}`}
                        </Status>
                      ),
                    },
                    { label: "Auth mode", value: <Mono>{health.auth_mode}</Mono> },
                    {
                      label: "AI providers",
                      value: health.ai_providers_configured.length ? (
                        <span className="flex flex-wrap gap-1">
                          {health.ai_providers_configured.map((p) => (
                            <Badge key={p} tone="outline">
                              {p}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-warn">No platform provider configured</span>
                      ),
                    },
                    { label: "Model registry", value: <Mono>{health.registry_version}</Mono> },
                    {
                      label: "Monitoring data",
                      value: health.monitoring.has_data ? (
                        <span className="text-fg-2">
                          Last HTTP event {fmtAgo(health.monitoring.last_http_event)} · last AI event {fmtAgo(health.monitoring.last_ai_event)}
                        </span>
                      ) : (
                        <span className="text-warn">No events recorded yet</span>
                      ),
                    },
                  ]}
                />
              </Block>
              <Block title="Privacy & alerting configuration">
                <DescriptionList
                  className="rounded-xl border border-border bg-surface shadow-sm p-4"
                  items={[
                    { label: "Personal-data minimum", value: <Mono>{health.privacy.personal_min_privacy}</Mono> },
                    { label: "PII redaction", value: <Status tone={health.privacy.pii_redaction ? "ok" : "warn"}>{health.privacy.pii_redaction ? "enabled" : "disabled"}</Status> },
                    { label: "Groq ZDR attested", value: health.privacy.groq_zdr_attested ? "yes" : "no" },
                    { label: "Gemini paid tier attested", value: health.privacy.gemini_paid_tier_attested ? "yes" : "no" },
                    {
                      label: "Alert scheduler",
                      value: (
                        <Status tone={health.alerts.running ? "ok" : "warn"}>
                          {health.alerts.running ? `running · every ${health.alerts.interval_minutes} min` : "not running in-process (cron or disabled)"}
                        </Status>
                      ),
                    },
                    { label: "Last alert cycle", value: health.alerts.last_run ? fmtDateTime(health.alerts.last_run, locale) : "never in this process" },
                    {
                      label: "Alert channel",
                      value:
                        health.alerts.channel === "disabled" ? <span className="text-warn">disabled — alerts are persisted only</span> : <Mono>{health.alerts.channel}</Mono>,
                    },
                  ]}
                />
              </Block>
            </div>

            <Block title="HTTP traffic" def="http_latency" description={`All API requests recorded in the last ${filters.days === 1 ? "24 hours" : `${filters.days} days`}.`}>
              <KpiStrip cols={5}>
                <Kpi label="Requests" value={fmtNum(http.requests)} />
                <Kpi
                  label="5xx error rate"
                  def="http_5xx"
                  value={fmtPct(rateOf(http.error_rate_5xx, http.requests))}
                  sample={<Sample n={http.requests} unit="requests" />}
                  tone={http.requests && http.error_rate_5xx > 0.05 ? "bad" : undefined}
                />
                <Kpi label="4xx responses" value={fmtNum(http.client_errors_4xx)} hint="client errors (validation, auth)" />
                <Kpi label="p50 latency" def="http_latency" value={fmtMs(http.p50_ms)} sample={<Sample n={http.requests} unit="requests" />} />
                <Kpi label="p95 latency" def="http_latency" value={fmtMs(http.p95_ms)} sample={<Sample n={http.requests} unit="requests" />} />
              </KpiStrip>
            </Block>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Block title="Status code distribution">
                {statusRows.length === 0 ? (
                  <NoData />
                ) : (
                  <HBars
                    rows={statusRows}
                    labelKey="status"
                    labelHeader="Status class"
                    xFormat={(v) => fmtNum(v)}
                    summary={`HTTP status classes: ${statusRows.map((r) => `${r.status} ${r.count}`).join(", ")}`}
                    series={[{ key: "count", name: "Responses", color: C.c1, format: fmtNum }]}
                  />
                )}
              </Block>
              <Block title="Busiest routes" description="Top 10 by request count.">
                <RoutesTable rows={http.routes} label="Busiest routes" />
              </Block>
            </div>

            <Block title="Slowest routes" description="Highest p95 server latency.">
              <RoutesTable rows={http.slowest_routes} label="Slowest routes" />
            </Block>

            <Block title="Recent server errors" description="Most recent first. Messages are scrubbed server-side; the id is the one users see.">
              {e.data.recent_errors.length === 0 ? (
                <NoData title="No server errors in this window" text="Nothing was logged to the error log for the selected range." />
              ) : (
                <TableWrap label="Recent server errors">
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        Time
                      </th>
                      <th scope="col" className={th}>
                        Route
                      </th>
                      <th scope="col" className={th}>
                        Type
                      </th>
                      <th scope="col" className={th}>
                        Message
                      </th>
                      <th scope="col" className={th}>
                        Error id
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.data.recent_errors.map((r) => (
                      <tr key={r.id}>
                        <td className={`${td} whitespace-nowrap text-fg-2`}>{fmtDateTime(r.at, locale)}</td>
                        <td className={td}>
                          <Mono>{r.route}</Mono>
                        </td>
                        <td className={td}>
                          <Badge tone="bad">{r.type}</Badge>
                        </td>
                        <td className={`${td} max-w-md text-fg-2`}>
                          <span className="line-clamp-2 whitespace-normal">{r.message}</span>
                        </td>
                        <td className={td}>
                          <Mono>{r.id.slice(0, 8)}</Mono>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Block>

            <Definitions keys={["http_5xx", "http_latency", "sample"]} />
          </div>
        )}
      </QueryGate>
    </>
  );
}
