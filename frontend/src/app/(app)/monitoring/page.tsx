"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, ClipboardCheck, Cpu, FlaskConical, Gauge, HelpCircle, RefreshCw, ShieldAlert, Timer } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, ErrorNote, Loading } from "@/components/feedback";
import { ChartArt } from "@/components/sketch/illustrations";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, pct, timeAgo } from "@/lib/utils";

type Metrics = {
  window_days: number;
  generated_at: string;
  ai: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    failure_rate: number;
    attempts: number;
    attempt_error_rate: number;
    retried_requests: number;
    fallback_requests: number;
    fallback_rate: number;
    latency_ms: { avg: number; p50: number; p95: number; p99: number };
    e2e_latency_ms: { p50: number; p95: number };
    error_types: Record<string, number>;
    tokens_by_provider: { provider: string; prompt: number; completion: number }[];
    tokens_by_task: { task: string; prompt: number; completion: number }[];
    total_tokens: number;
    providers: { provider: string; attempts: number; success_rate: number; avg_latency_ms: number; p95_latency_ms: number }[];
    tasks: { task: string; requests: number; success_rate: number }[];
    timeseries: { bucket: string; requests: number; failed: number; p95_ms: number; tokens: number }[];
  };
  http: { requests: number; error_rate_5xx: number; client_errors_4xx: number; p50_ms: number; p95_ms: number; routes: { route: string; count: number; errors_5xx: number; p95_ms: number }[] };
  quality: {
    unsupported_claim_rate: number;
    claims_checked: number;
    unsupported_claims: number;
    outputs_checked: number;
    outputs_with_unsupported: number;
    cv_decisions: { accepted: number; edited: number; rejected: number };
    cv_acceptance_rate: number | null;
    achievement_feedback: { confirmed: number; rejected: number };
    extraction_precision: number | null;
    task_completion: { task: string; completed: number; failed: number; rate: number }[];
    task_success_rate: number | null;
    publish: Record<string, number>;
    injection_flags: number;
  };
  recent_errors: { id: string; at: string; route: string; type: string; message: string }[];
  recent_ai_failures: { at: string; task: string; provider: string; model: string; error_type: string; http_status: number | null; attempt: number; latency_ms: number }[];
  latest_eval: { id: string; at: string; provider: string; model: string; summary: Record<string, unknown> } | null;
  alerts: { level: "critical" | "warning"; key: string; title: string; value: number; threshold: number; investigate: string }[];
};

type EvalRun = { id: string; at: string; provider: string; model: string; summary: Record<string, unknown>; cases: { id: string; task: string; type: string; passed: boolean; error: string | null; checks: Record<string, boolean> }[] };

const C1 = "var(--chart-1)";
const C2 = "var(--chart-2)";
const C3 = "var(--chart-3)";
const BAD = "var(--bad)";
const axis = { stroke: "var(--ink-faint)", fontSize: 12 };

function Kpi({ label, value, sub, icon, state, why }: { label: string; value: string; sub?: string; icon: React.ReactNode; state?: "ok" | "warn" | "bad"; why: string }) {
  return (
    <Card className={cn("flex flex-col gap-1 p-4", state === "bad" && "!bg-bad-fill", state === "warn" && "!bg-warn-fill")}>
      <div className="flex items-center gap-2 text-sm text-ink-soft [&_svg]:size-4">
        {icon} {label}
        <span className="ms-auto" title={why} aria-label={why}>
          <HelpCircle className="size-3.5 text-ink-faint" />
        </span>
      </div>
      <div className="font-hand text-4xl leading-none">{value}</div>
      {sub && <div className="text-xs text-ink-faint">{sub}</div>}
    </Card>
  );
}

function Why({ children }: { children: React.ReactNode }) {
  return <p className="-mt-2 mb-4 text-xs text-ink-faint">{children}</p>;
}

export default function MonitoringPage() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const m = useApi<Metrics>(`/api/monitoring/metrics?days=${days}&scope=${scope}`);
  const [evalRun, setEvalRun] = useState<EvalRun | null>(null);
  const d = m.data;

  const fmtMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
  const series = d?.ai.timeseries.map((x) => ({ ...x, ok: x.requests - x.failed, label: x.bucket.slice(5) })) ?? [];

  return (
    <div>
      <PageHeader title={t("mon.title")} sub={t("mon.sub")} art={<ChartArt className="h-28 w-auto" />} />

      {/* filters in one row */}
      <div className="sketch-soft mb-6 flex flex-wrap items-center gap-4 bg-paper-2 p-3">
        <Segmented ariaLabel="Time window" value={days} onChange={setDays} options={[{ value: "1", label: "24h" }, { value: "7", label: "7d" }, { value: "30", label: "30d" }]} />
        <Segmented
          ariaLabel="Scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: locale === "ar" ? "كل المنصة" : "Whole platform" },
            { value: "mine", label: locale === "ar" ? "طلباتي" : "My requests" },
          ]}
        />
        <span className="ms-auto text-xs text-ink-faint">{d && `updated ${timeAgo(d.generated_at)} ago`}</span>
        <Button size="sm" variant="outline" onClick={m.reload} loading={m.loading}>
          <RefreshCw /> {locale === "ar" ? "تحديث" : "Refresh"}
        </Button>
      </div>

      <ErrorNote error={m.error} onRetry={m.reload} />
      {!d && m.loading && <Loading />}
      {d && d.ai.total_requests === 0 && d.http.requests === 0 && (
        <EmptyState
          title={locale === "ar" ? "لا توجد أحداث بعد" : "No events recorded yet"}
          text={locale === "ar" ? "استخدم أي ميزة ذكاء اصطناعي وستظهر المقاييس هنا فوراً." : "Use any AI feature and its real metrics appear here immediately — nothing on this page is simulated."}
        />
      )}

      {d && (d.ai.total_requests > 0 || d.http.requests > 0) && (
        <div className="flex flex-col gap-6">
          {/* alerts */}
          {d.alerts.length > 0 ? (
            <div className="flex flex-col gap-3">
              {d.alerts.map((a) => (
                <div key={a.key} role="alert" className={cn("sketch flex items-start gap-3 p-4", a.level === "critical" ? "!bg-bad-fill" : "!bg-warn-fill")}>
                  {a.level === "critical" ? <AlertOctagon className="mt-0.5 size-6 shrink-0" /> : <AlertTriangle className="mt-0.5 size-6 shrink-0" />}
                  <div className="text-sm">
                    <div className="font-hand text-xl">
                      {a.title} — {a.value < 1 ? pct(a.value) : fmtMs(a.value)} (threshold {a.threshold < 1 ? pct(a.threshold) : fmtMs(a.threshold)})
                    </div>
                    <p className="mt-1">
                      <b>{locale === "ar" ? "كيف تحقق:" : "How to investigate:"}</b> {a.investigate}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sketch-soft flex items-center gap-2 bg-ok-fill p-3 text-sm">
              <CheckCircle2 className="size-5" /> {locale === "ar" ? "لا تنبيهات — كل المقاييس ضمن الحدود." : "No alerts — all metrics within thresholds (alerts need ≥5 requests to fire)."}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={<Cpu />} label="AI requests" value={String(d.ai.total_requests)} sub={`${d.ai.attempts} attempts · ${d.ai.retried_requests} retried`} why="Logical AI calls; one call can take several provider attempts." />
            <Kpi
              icon={<AlertOctagon />}
              label="Failure rate"
              value={pct(d.ai.failure_rate, 1)}
              sub={`${d.ai.failed_requests} failed · attempt err ${pct(d.ai.attempt_error_rate)}`}
              state={d.ai.failure_rate > 0.2 ? "bad" : d.ai.failure_rate > 0.05 ? "warn" : "ok"}
              why="Share of AI calls where every provider and retry failed — what users actually feel."
            />
            <Kpi icon={<Timer />} label="p95 latency" value={fmtMs(d.ai.latency_ms.p95)} sub={`p50 ${fmtMs(d.ai.latency_ms.p50)} · p99 ${fmtMs(d.ai.latency_ms.p99)}`} why="95th percentile of successful provider calls. Averages hide slow tails." />
            <Kpi icon={<RefreshCw />} label="Fallback rate" value={pct(d.ai.fallback_rate)} sub={`${d.ai.fallback_requests} served by backup`} state={d.ai.fallback_rate > 0.3 ? "warn" : undefined} why="Successful calls that needed a secondary provider — early warning for a degrading primary." />
            <Kpi
              icon={<ShieldAlert />}
              label="Unsupported claims"
              value={pct(d.quality.unsupported_claim_rate, 1)}
              sub={`${d.quality.unsupported_claims}/${d.quality.claims_checked} claims`}
              state={d.quality.unsupported_claim_rate > 0.1 ? "warn" : undefined}
              why="Numbers, skills or credentials in AI output that are not in the user's evidence (hallucination proxy)."
            />
            <Kpi icon={<ClipboardCheck />} label="Task success" value={pct(d.quality.task_success_rate)} sub={`${d.ai.total_tokens.toLocaleString()} tokens`} why="User-facing tasks (post, extraction, tailoring…) that completed end-to-end." />
          </div>

          {/* time series */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle icon={<Cpu />}>AI requests over time</CardTitle>
              <Why>Spikes in failed (red) bars point to provider outages or quota exhaustion — check “Error types”.</Why>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={series} barCategoryGap="25%">
                    <CartesianGrid vertical={false} stroke="var(--paper-3)" />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--ink-faint)" }} />
                    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={32} />
                    <Tooltip cursor={{ fill: "var(--paper-3)" }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="ok" name="succeeded" stackId="a" fill={C1} stroke="var(--paper)" strokeWidth={2} />
                    <Bar dataKey="failed" name="failed" stackId="a" fill={BAD} stroke="var(--paper)" strokeWidth={2} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardTitle icon={<Timer />}>End-to-end p95 latency</CardTitle>
              <Why>Includes retries and fallbacks. A rising line with flat request volume suggests provider slowdown.</Why>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid vertical={false} stroke="var(--paper-3)" />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--ink-faint)" }} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtMs(v)} />
                    <Tooltip formatter={(v) => fmtMs(Number(v))} />
                    <Line type="monotone" dataKey="p95_ms" name="p95" stroke={C1} strokeWidth={2} dot={{ r: 4, fill: C1, stroke: "var(--paper)", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* providers + errors */}
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardTitle icon={<Gauge />}>Providers</CardTitle>
              <Why>Per-attempt reliability and speed by provider; drives AI_PROVIDER_PRIORITY decisions.</Why>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-start text-xs text-ink-faint">
                    <tr>
                      <th className="py-1 text-start">provider</th>
                      <th className="text-end">attempts</th>
                      <th className="text-end">success</th>
                      <th className="text-end">avg</th>
                      <th className="text-end">p95</th>
                      <th className="text-end">tokens (in / out)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ai.providers.map((p) => {
                      const tk = d.ai.tokens_by_provider.find((x) => x.provider === p.provider);
                      return (
                        <tr key={p.provider} className="border-t border-ink/15">
                          <td className="py-2 font-bold">{p.provider}</td>
                          <td className="text-end">{p.attempts}</td>
                          <td className="text-end">{pct(p.success_rate)}</td>
                          <td className="text-end">{fmtMs(p.avg_latency_ms)}</td>
                          <td className="text-end">{fmtMs(p.p95_latency_ms)}</td>
                          <td className="text-end">
                            {tk?.prompt.toLocaleString()} / {tk?.completion.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 h-56">
                <div className="mb-1 text-sm font-bold">Tokens by task</div>
                <ResponsiveContainer>
                  <BarChart data={d.ai.tokens_by_task} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid horizontal={false} stroke="var(--paper-3)" />
                    <XAxis type="number" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="task" tick={axis} tickLine={false} axisLine={false} width={130} />
                    <Tooltip cursor={{ fill: "var(--paper-3)" }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="prompt" name="input" stackId="t" fill={C1} stroke="var(--paper)" strokeWidth={2} />
                    <Bar dataKey="completion" name="output" stackId="t" fill={C2} stroke="var(--paper)" strokeWidth={2} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardTitle icon={<AlertTriangle />}>Error types</CardTitle>
              <Why>rate_limit → free-tier quota · auth → bad key · validation → model broke the JSON schema · timeout → slow provider.</Why>
              {Object.keys(d.ai.error_types).length === 0 ? (
                <p className="text-sm text-ink-soft">No AI errors in this window.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {Object.entries(d.ai.error_types)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <li key={k} className="flex items-center gap-3 text-sm">
                        <span className="w-28 font-bold">{k}</span>
                        <span className="h-3 rounded-full border-2 border-ink bg-bad-fill" style={{ width: `${Math.max(8, (v / Math.max(...Object.values(d.ai.error_types))) * 100)}%` }} />
                        <span className="ms-auto">{v}</span>
                      </li>
                    ))}
                </ul>
              )}
              <div className="mt-5 text-sm font-bold">Recent AI failures</div>
              <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto text-xs">
                {d.recent_ai_failures.length === 0 && <li className="text-ink-faint">—</li>}
                {d.recent_ai_failures.map((f, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2 rounded-lg bg-paper-2 px-2 py-1">
                    <span className="text-ink-faint">{timeAgo(f.at)}</span>
                    <b>{f.provider}</b>
                    <span>{f.task}</span>
                    <Badge tone="bad">{f.error_type}</Badge>
                    {f.http_status && <span>HTTP {f.http_status}</span>}
                    <span>try {f.attempt}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* AI quality */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardTitle icon={<ClipboardCheck />}>CV update decisions</CardTitle>
              <Why>Acceptance rate of AI-drafted CV changes = usefulness signal from real users.</Why>
              <div className="font-hand text-5xl">{pct(d.quality.cv_acceptance_rate)}</div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                {(
                  [
                    ["accepted", d.quality.cv_decisions.accepted, C3],
                    ["edited", d.quality.cv_decisions.edited, C2],
                    ["rejected", d.quality.cv_decisions.rejected, BAD],
                  ] as const
                ).map(([k, v, c]) => {
                  const tot = d.quality.cv_decisions.accepted + d.quality.cv_decisions.edited + d.quality.cv_decisions.rejected || 1;
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-20">{k}</span>
                      <span className="h-3 rounded-full" style={{ width: `${(v / tot) * 100}%`, minWidth: 4, background: c }} />
                      <span className="ms-auto font-bold">{v}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card>
              <CardTitle icon={<FlaskConical />}>Extraction quality</CardTitle>
              <Why>Precision proxy: share of AI-discovered achievements that users confirm instead of reject.</Why>
              <div className="font-hand text-5xl">{pct(d.quality.extraction_precision)}</div>
              <p className="mt-2 text-sm">
                {d.quality.achievement_feedback.confirmed} confirmed · {d.quality.achievement_feedback.rejected} rejected
              </p>
              <p className="mt-3 text-sm">
                <b>{d.quality.injection_flags}</b> prompt-injection pattern(s) redacted from uploads/inputs
              </p>
              <p className="mt-1 text-sm">
                <b>{d.quality.outputs_with_unsupported}</b>/{d.quality.outputs_checked} outputs had ≥1 unsupported claim
              </p>
            </Card>
            <Card>
              <CardTitle icon={<CheckCircle2 />}>Task completion</CardTitle>
              <Why>End-to-end success per user task (includes validation and DB writes, not just the LLM call).</Why>
              <ul className="flex flex-col gap-1.5 text-sm">
                {d.quality.task_completion.length === 0 && <li className="text-ink-faint">—</li>}
                {d.quality.task_completion.map((tc) => (
                  <li key={tc.task} className="flex items-center gap-2">
                    <span className="flex-1">{tc.task}</span>
                    <span className="text-xs text-ink-faint">
                      {tc.completed}✓ {tc.failed > 0 && `${tc.failed}✗`}
                    </span>
                    <Badge tone={tc.rate >= 0.9 ? "ok" : tc.rate >= 0.7 ? "warn" : "bad"}>{pct(tc.rate)}</Badge>
                  </li>
                ))}
              </ul>
              {Object.keys(d.quality.publish).length > 0 && (
                <p className="mt-3 text-xs text-ink-soft">
                  LinkedIn publish: {Object.entries(d.quality.publish).map(([k, v]) => `${k} ${v}`).join(" · ")}
                </p>
              )}
            </Card>
          </div>

          {/* evaluation */}
          <Card tone="tint">
            <CardTitle icon={<FlaskConical />}>Offline evaluation (eval/dataset.json)</CardTitle>
            {!d.latest_eval ? (
              <p className="text-sm text-ink-soft">
                No evaluation run recorded yet. Run <code className="rounded bg-paper px-1">python -m app.evaluation</code> in <code className="rounded bg-paper px-1">backend/</code> with a provider key configured.
                Scores are never shown before a real run.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-sm text-ink-soft">
                  {timeAgo(d.latest_eval.at)} ago · {d.latest_eval.provider} · {d.latest_eval.model}
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {(
                    [
                      ["task_success_rate", "Task success"],
                      ["extraction_case_accuracy", "Extraction cases"],
                      ["extraction_skill_precision", "Skill precision"],
                      ["extraction_skill_recall", "Skill recall"],
                      ["negative_false_positive_rate", "False positives (neg.)"],
                      ["post_unsupported_claim_rate", "Post unsupported claims"],
                      ["tailor_no_invention_rate", "Tailoring: no invention"],
                      ["evidence_quote_verification_rate", "Quotes verified"],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k} className="sketch-soft bg-paper p-3">
                      <div className="text-xs text-ink-soft">{label}</div>
                      <div className="font-hand text-3xl">{typeof d.latest_eval!.summary[k] === "number" ? pct(d.latest_eval!.summary[k] as number) : "—"}</div>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="self-start" onClick={async () => setEvalRun(await api<EvalRun>(`/api/monitoring/evals/${d.latest_eval!.id}`))}>
                  {locale === "ar" ? "عرض الحالات" : "View cases"}
                </Button>
              </div>
            )}
          </Card>

          {/* http + errors */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>API health</CardTitle>
              <Why>Route templates only (no ids or personal data). 5xx = our bugs; 4xx = validation / auth.</Why>
              <p className="mb-3 text-sm">
                {d.http.requests} requests · 5xx {pct(d.http.error_rate_5xx, 1)} · 4xx {d.http.client_errors_4xx} · p95 {fmtMs(d.http.p95_ms)}
              </p>
              <table className="w-full text-xs">
                <tbody>
                  {d.http.routes.map((r) => (
                    <tr key={r.route} className="border-t border-ink/15">
                      <td className="py-1.5 font-mono">{r.route}</td>
                      <td className="text-end">{r.count}</td>
                      <td className={cn("text-end", r.errors_5xx > 0 && "font-bold text-bad")}>{r.errors_5xx}</td>
                      <td className="text-end">{fmtMs(r.p95_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <CardTitle>Recent server errors</CardTitle>
              <Why>Each user-facing error message carries this reference id, so a support report maps to one row here.</Why>
              <ul className="flex flex-col gap-1.5 text-xs">
                {d.recent_errors.length === 0 && <li className="text-ink-faint">None 🎉</li>}
                {d.recent_errors.map((e) => (
                  <li key={e.id} className="rounded-lg bg-paper-2 px-2 py-1.5">
                    <code>{e.id.slice(0, 8)}</code> · {timeAgo(e.at)} · <b>{e.type}</b> · {e.route}
                    <div className="text-ink-soft">{e.message}</div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={!!evalRun} onOpenChange={(o) => !o && setEvalRun(null)}>
        <DialogContent title="Evaluation cases" wide>
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-faint">
              <tr>
                <th className="text-start">case</th>
                <th className="text-start">task</th>
                <th className="text-start">type</th>
                <th className="text-start">result</th>
                <th className="text-start">failed checks</th>
              </tr>
            </thead>
            <tbody>
              {evalRun?.cases.map((c) => (
                <tr key={c.id} className="border-t border-ink/15">
                  <td className="py-1.5 font-mono">{c.id}</td>
                  <td>{c.task}</td>
                  <td>{c.type}</td>
                  <td>
                    <Badge tone={c.passed ? "ok" : "bad"}>{c.passed ? "PASS" : "FAIL"}</Badge>
                  </td>
                  <td className="text-xs">
                    {c.error ||
                      Object.entries(c.checks)
                        .filter(([, v]) => !v)
                        .map(([k]) => k)
                        .join(", ") ||
                      "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
