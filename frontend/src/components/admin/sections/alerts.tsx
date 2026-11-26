"use client";

import { AlertOctagon, AlertTriangle, BellOff, BellRing, Play, Send } from "lucide-react";
import { useState } from "react";
import { ErrorNote, Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone, Status } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { adminFetchGuard, useAdminAccess, useAdminQuery } from "../context";
import { fmtAlertValue, fmtDateTime, fmtMs, fmtNum, fmtPct, fmtUsd, humanize } from "../format";
import { Block, LastUpdated, Mono, NoData, QueryGate, SectionHeader, TableWrap, td, tdNum, th, ThInfo } from "../primitives";
import type { AlertsResponse, EvaluateResult, Incident, TestAlertResult } from "../types";

const THRESHOLD_FMT: Record<string, (v: number) => string> = {
  failure_rate: (v) => fmtPct(v),
  p95_latency_ms: (v) => fmtMs(v),
  raw_unsupported_claim_rate: (v) => fmtPct(v),
  fallback_rate: (v) => fmtPct(v),
  daily_cost_usd: (v) => `${fmtUsd(v)} (estimate)`,
  cooldown_minutes: (v) => `${v} min`,
  min_sample: (v) => `${fmtNum(v)} events`,
};

const NOTIFY_TONE: Record<string, BadgeTone> = { sent: "ok", failed: "bad", pending: "warn", disabled: "neutral" };

type StatusFilter = "all" | "open" | "resolved";

export function AlertsView() {
  const { t, locale } = useI18n();
  const { deny } = useAdminAccess();
  const [status, setStatus] = useState<StatusFilter>("all");
  const q = useAdminQuery<AlertsResponse>(`/api/admin/monitoring/alerts${status === "all" ? "" : `?status=${status}`}`);
  const [pending, setPending] = useState<"evaluate" | "test" | null>(null);
  const [confirmTest, setConfirmTest] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluateResult | null>(null);
  const [testResult, setTestResult] = useState<TestAlertResult | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const d = q.data;
  const disabled = d?.channel === "disabled";

  const run = async <R,>(kind: "evaluate" | "test", path: string, done: (r: R) => void) => {
    setPending(kind);
    setActionError(null);
    try {
      const r = await api<R>(path, { method: "POST" });
      done(r);
      await q.reload();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      if (!adminFetchGuard(err, deny)) setActionError(err);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <SectionHeader
        title={t("admin2.nav.alerts")}
        sub={t("admin2.alerts.sub")}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <LastUpdated at={q.fetchedAt} loading={q.loading} onRefresh={q.reload} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmTest(true)}
              disabled={!d || disabled || pending !== null}
              title={disabled ? "No external alert channel is configured" : undefined}
            >
              <Send aria-hidden /> {t("admin2.alerts.test")}
            </Button>
            <Button
              size="sm"
              loading={pending === "evaluate"}
              disabled={!d || pending !== null}
              onClick={() => run<EvaluateResult>("evaluate", "/api/admin/monitoring/alerts/evaluate", (r) => setEvalResult(r))}
            >
              {pending !== "evaluate" && <Play aria-hidden />} {t("admin2.alerts.evaluate")}
            </Button>
          </div>
        }
      />

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {actionError && <ErrorNote error={actionError} className="mb-4" />}
        {evalResult && (
          <Notice tone={evalResult.firing.length ? "warn" : "ok"} className="mb-4" title={`Evaluated ${fmtDateTime(evalResult.evaluated_at, locale)} (last 24 h)`}>
            {evalResult.firing.length ? `${evalResult.firing.length} rule(s) firing: ${evalResult.firing.join(", ")}.` : "No rule is firing."} Opened {evalResult.opened.length}, resolved{" "}
            {evalResult.resolved.length}, notifications sent {evalResult.notified}
            {evalResult.channel === "disabled" ? " (external delivery not configured)." : "."}
          </Notice>
        )}
        {testResult && (
          <Notice tone={testResult.delivered ? "ok" : "bad"} className="mb-4" title={testResult.delivered ? `Test alert delivered via ${testResult.channel}` : "Test alert was not delivered"}>
            {!testResult.delivered && (testResult.error ?? "The channel rejected the message.")}
          </Notice>
        )}
      </div>

      <QueryGate queries={[q]}>
        {d && (
          <div className="flex flex-col gap-10">
            <div className="grid gap-8 lg:grid-cols-3">
              <Block title="Notification channel">
                {disabled ? (
                  <Notice tone="warn" icon={<BellOff className="text-warn" />} title="External delivery is not configured">
                    Alerts are persisted as incidents only. Set ALERT_SLACK_WEBHOOK_URL or ALERT_WEBHOOK_URL on the backend to notify on-call.
                  </Notice>
                ) : (
                  <Notice tone="ok" icon={<BellRing className="text-ok" />} title={`Delivering to ${d.channel}`}>
                    Incidents notify once, retry failed deliveries, and remind after the cooldown.
                  </Notice>
                )}
              </Block>
              <Block title="Scheduler">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface shadow-sm p-4 text-sm">
                  <dt className="text-fg-3">State</dt>
                  <dd>
                    <Status tone={d.scheduler.running ? "ok" : "warn"}>{d.scheduler.running ? "running in-process" : "not running in-process"}</Status>
                  </dd>
                  <dt className="text-fg-3">Interval</dt>
                  <dd className="num text-fg">{d.scheduler.interval_minutes > 0 ? `${d.scheduler.interval_minutes} min` : "disabled (use cron)"}</dd>
                  <dt className="text-fg-3">Last run</dt>
                  <dd className="text-fg">{d.scheduler.last_run ? fmtDateTime(d.scheduler.last_run, locale) : "none in this process"}</dd>
                  <dt className="text-fg-3">Last error</dt>
                  <dd className="text-fg">{d.scheduler.last_error ? <span className="text-bad">{d.scheduler.last_error}</span> : "none"}</dd>
                </dl>
              </Block>
              <Block title="Thresholds" description="A rule fires only once the minimum sample is reached (escaped claims fire at 1).">
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-surface shadow-sm p-4 text-sm">
                  {Object.entries(d.thresholds).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-fg-3">{humanize(k)}</dt>
                      <dd className="num text-end text-fg">{(THRESHOLD_FMT[k] ?? fmtNum)(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Block>
            </div>

            <Block
              title="Incidents"
              description="One open incident per rule; resolved automatically when the rule clears. Latest 100."
              action={
                <Segmented<StatusFilter>
                  size="sm"
                  ariaLabel="Incident status"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: t("admin2.status.all") },
                    { value: "open", label: t("admin2.status.open") },
                    { value: "resolved", label: t("admin2.status.resolved") },
                  ]}
                />
              }
            >
              {d.incidents.length === 0 ? (
                <NoData title="No incidents" text={status === "all" ? "No alert rule has fired yet. Use “Evaluate now” to run the rules immediately." : "No incidents with this status."} />
              ) : (
                <IncidentTable rows={d.incidents} locale={locale} />
              )}
            </Block>
          </div>
        )}
      </QueryGate>

      <ConfirmDialog
        open={confirmTest}
        onOpenChange={setConfirmTest}
        title={t("admin2.alerts.test.title")}
        description={t("admin2.alerts.test.text")}
        confirmLabel={t("admin2.alerts.test.confirm")}
        loading={pending === "test"}
        onConfirm={async () => {
          await run<TestAlertResult>("test", "/api/admin/monitoring/alerts/test", (r) => setTestResult(r));
          setConfirmTest(false);
        }}
      >
        {d && (
          <p className="text-sm text-fg-2">
            Channel: <Mono>{d.channel}</Mono>
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

function IncidentTable({ rows, locale }: { rows: Incident[]; locale: string }) {
  return (
    <TableWrap label="Incidents">
      <thead>
        <tr>
          <th scope="col" className={th}>
            Severity
          </th>
          <th scope="col" className={th}>
            Incident
          </th>
          <th scope="col" className={th}>
            Status
          </th>
          <ThInfo num>Value vs threshold</ThInfo>
          <ThInfo num def="sample">
            Sample
          </ThInfo>
          <th scope="col" className={th}>
            Opened · last seen
          </th>
          <th scope="col" className={th}>
            Notification
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id}>
            <td className={td}>
              {i.severity === "critical" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-bad">
                  <AlertOctagon className="size-3.5" aria-hidden /> Critical
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warn">
                  <AlertTriangle className="size-3.5" aria-hidden /> {humanize(i.severity)}
                </span>
              )}
            </td>
            <td className={`${td} max-w-sm whitespace-normal`}>
              <div className="font-medium">{i.title}</div>
              <Mono className="text-[11px]">{i.key}</Mono>
              {i.investigate && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-primary-text">How to investigate</summary>
                  <p className="mt-1 text-xs text-fg-2">{i.investigate}</p>
                </details>
              )}
            </td>
            <td className={td}>
              <Status tone={i.status === "open" ? "bad" : "ok"}>{i.status}</Status>
              {i.resolved_at && <div className="mt-0.5 text-[11px] text-fg-3">{fmtDateTime(i.resolved_at, locale)}</div>}
            </td>
            <td className={tdNum}>
              <span className="font-medium">{fmtAlertValue(i.key, i.value)}</span>
              <span className="text-fg-3"> / {fmtAlertValue(i.key, i.threshold)}</span>
            </td>
            <td className={tdNum}>{fmtNum(i.sample_size)}</td>
            <td className={`${td} text-xs whitespace-nowrap text-fg-2`}>
              <div>{fmtDateTime(i.opened_at, locale)}</div>
              <div className="text-fg-3">{fmtDateTime(i.last_seen_at, locale)}</div>
            </td>
            <td className={`${td} text-xs`}>
              <Badge tone={NOTIFY_TONE[i.notify_status] ?? "outline"}>{i.notify_status === "disabled" ? "not configured" : i.notify_status}</Badge>
              <div className="num mt-0.5 text-fg-3">
                {i.notify_attempts} attempt{i.notify_attempts === 1 ? "" : "s"}
                {i.recovery_notified ? " · recovery sent" : ""}
              </div>
              {i.last_error && <div className="mt-0.5 max-w-[12rem] truncate text-bad" title={i.last_error}>{i.last_error}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
