"use client";

import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import { useState } from "react";
import { ErrorNote, Notice } from "@/components/feedback";
import { Badge, type BadgeTone } from "@/components/ui/card";
import { Checkbox, Segmented } from "@/components/ui/form";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAdminQuery } from "../context";
import { fmtDateTime, fmtNum, fmtSummaryValue, humanize, NA } from "../format";
import { Block, LastUpdated, Mono, NoData, QueryGate, SectionHeader, TableWrap, td, tdNum, th, V } from "../primitives";
import type { EvalRunDetail, EvalRunSummary } from "../types";

const KIND_TONE: Record<string, BadgeTone> = { deterministic: "neutral", live: "brand", benchmark: "warn" };

export function EvalKindBadge({ kind }: { kind: string }) {
  const { t } = useI18n();
  const key = `admin2.eval.${kind}` as TKey;
  const known = kind === "deterministic" || kind === "live" || kind === "benchmark";
  return (
    <Badge tone={KIND_TONE[kind] ?? "outline"} title={kind === "deterministic" ? "Offline regression suite — no live AI provider" : undefined}>
      {known ? t(key) : kind}
    </Badge>
  );
}

function passRate(s: Record<string, unknown>): string {
  const v = s.task_success_rate ?? s.case_pass_rate;
  return typeof v === "number" ? fmtSummaryValue("rate", v) : NA;
}

function providerLabel(r: EvalRunSummary) {
  if (r.kind === "deterministic") return "No live AI provider";
  return [r.provider, r.model].filter(Boolean).join(" · ") || NA;
}

type Kind = "all" | "deterministic" | "live" | "benchmark";

export function EvaluationView() {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<Kind>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [failuresOnly, setFailuresOnly] = useState(false);
  const list = useAdminQuery<EvalRunSummary[]>(`/api/admin/monitoring/evals${kind === "all" ? "" : `?kind=${kind}`}`);
  const runs = list.data ?? [];
  const activeId = selected && runs.some((r) => r.id === selected) ? selected : (runs[0]?.id ?? null);
  const detail = useAdminQuery<EvalRunDetail>(activeId ? `/api/admin/monitoring/evals/${encodeURIComponent(activeId)}` : null);
  const run = detail.data && detail.data.id === activeId ? detail.data : null;

  return (
    <>
      <SectionHeader
        title={t("admin2.nav.eval")}
        sub={t("admin2.eval.sub")}
        right={
          <LastUpdated
            at={list.fetchedAt}
            loading={list.loading}
            onRefresh={() => {
              list.reload();
              detail.reload();
            }}
          />
        }
      />
      <div className="mb-6 flex flex-col gap-2">
        <Segmented<Kind>
          size="sm"
          ariaLabel="Run kind"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setSelected(null);
          }}
          options={[
            { value: "all", label: t("admin2.eval.all") },
            { value: "deterministic", label: t("admin2.eval.deterministic") },
            { value: "live", label: t("admin2.eval.live") },
            { value: "benchmark", label: t("admin2.eval.benchmark") },
          ]}
        />
        <p className="text-xs text-fg-3">
          Deterministic = offline regression suite, no live AI provider is called. Live = a real provider run on the dataset. Benchmark = provider/model comparison.
        </p>
      </div>
      <QueryGate queries={[list]}>
        {runs.length === 0 ? (
          <NoData
            title="No evaluation runs recorded"
            text={kind === "all" ? "Run the evaluation suite in backend/ (python -m app.evaluation). Scores are never shown before a real run." : "No runs of this kind yet."}
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Block title="Runs" description="Latest 30, newest first.">
              <ul className="divide-y divide-border overflow-hidden ink-soft" aria-label="Evaluation runs">
                {runs.map((r) => {
                  const active = r.id === activeId;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                          active && "bg-primary-soft hover:bg-primary-soft",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <EvalKindBadge kind={r.kind} />
                            <span className="text-xs text-fg-3">{fmtDateTime(r.at, locale)}</span>
                          </div>
                          <div className="mt-1 truncate text-sm text-fg">{providerLabel(r)}</div>
                          <div className="text-xs text-fg-3">
                            dataset {r.dataset_version}
                            {r.git_sha ? ` · ${r.git_sha.slice(0, 7)}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-end">
                          <div className="num text-sm font-semibold text-fg">
                            <V>{passRate(r.summary)}</V>
                          </div>
                          <div className="num text-[11px] text-fg-3">{typeof r.summary.cases === "number" ? `${r.summary.cases} cases` : ""}</div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-fg-3 rtl:rotate-180" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Block>

            <div className="min-w-0" aria-live="polite">
              {detail.error ? (
                <ErrorNote error={detail.error} onRetry={detail.reload} />
              ) : !run ? (
                <div className="skeleton h-96 w-full rounded-xl" aria-label="Loading run" role="status" />
              ) : (
                <RunDetail run={run} failuresOnly={failuresOnly} setFailuresOnly={setFailuresOnly} />
              )}
            </div>
          </div>
        )}
      </QueryGate>
    </>
  );
}

function RunDetail({ run, failuresOnly, setFailuresOnly }: { run: EvalRunDetail; failuresOnly: boolean; setFailuresOnly: (v: boolean) => void }) {
  const { locale } = useI18n();
  const summary = Object.entries(run.summary).filter(([, v]) => typeof v !== "object" || v === null);
  const byTask = run.summary.by_task && typeof run.summary.by_task === "object" ? (run.summary.by_task as Record<string, unknown>) : null;
  const cases = failuresOnly ? run.cases.filter((c) => !c.passed) : run.cases;
  const failed = run.cases.filter((c) => !c.passed).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="ink-soft p-5" aria-label="Run details">
        <div className="flex flex-wrap items-center gap-2">
          <EvalKindBadge kind={run.kind} />
          <span className="text-sm text-fg-2">{fmtDateTime(run.at, locale)}</span>
        </div>
        {run.kind === "deterministic" && (
          <Notice tone="info" className="mt-3">
            Deterministic run: offline regression checks only. No live AI provider was called, so these numbers say nothing about model quality.
          </Notice>
        )}
        <dl className="mt-4 grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-fg-3">Provider / model</dt>
          <dd className="text-fg">{providerLabel(run)}</dd>
          <dt className="text-fg-3">Dataset</dt>
          <dd>
            <Mono>{run.dataset_version}</Mono>
          </dd>
          <dt className="text-fg-3">Verifier</dt>
          <dd>{run.verifier_version ? <Mono>{run.verifier_version}</Mono> : <V>{NA}</V>}</dd>
          <dt className="text-fg-3">Git commit</dt>
          <dd>{run.git_sha ? <Mono>{run.git_sha.slice(0, 12)}</Mono> : <V>{NA}</V>}</dd>
          <dt className="text-fg-3">Run id</dt>
          <dd>
            <Mono>{run.id}</Mono>
          </dd>
        </dl>
      </section>

      <Block title="Summary">
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 [&>div]:bg-surface [&>div]:px-4 [&>div]:py-2.5">
          {summary.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="text-xs text-fg-3">{humanize(k)}</dt>
              <dd className="text-sm font-medium text-fg">
                <V>{fmtSummaryValue(k, v)}</V>
              </dd>
            </div>
          ))}
          {byTask &&
            Object.entries(byTask).map(([k, v]) => (
              <div key={`task-${k}`} className="flex items-baseline justify-between gap-4">
                <dt className="text-xs text-fg-3">Pass rate · {k}</dt>
                <dd className="text-sm font-medium text-fg">
                  <V>{fmtSummaryValue("rate", v)}</V>
                </dd>
              </div>
            ))}
        </dl>
      </Block>

      <Block
        title="Cases"
        description={`${fmtNum(run.cases.length)} cases · ${fmtNum(failed)} failed`}
        action={<Checkbox label="Failures only" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />}
      >
        {cases.length === 0 ? (
          <NoData title={failuresOnly ? "No failed cases" : "No cases stored for this run"} text={failuresOnly ? "Every case in this run passed." : "This run recorded no per-case results."} />
        ) : (
          <TableWrap label="Evaluation cases">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Result
                </th>
                <th scope="col" className={th}>
                  Case
                </th>
                <th scope="col" className={th}>
                  Task / type
                </th>
                <th scope="col" className={th}>
                  Failed checks / error
                </th>
                <th scope="col" className={`${th} text-end`}>
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const failedChecks = Object.entries(c.checks ?? {})
                  .filter(([, ok]) => !ok)
                  .map(([k]) => k);
                return (
                  <tr key={c.id}>
                    <td className={td}>
                      {c.passed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                          <CheckCircle2 className="size-3.5" aria-hidden /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-bad">
                          <XCircle className="size-3.5" aria-hidden /> Fail
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <Mono>{c.id}</Mono>
                    </td>
                    <td className={`${td} text-xs`}>
                      <div>{c.task}</div>
                      {c.type && <div className="text-fg-3">{c.type}</div>}
                    </td>
                    <td className={`${td} max-w-sm whitespace-normal text-xs`}>
                      {c.error ? (
                        <span className="text-bad">{String(c.error)}</span>
                      ) : failedChecks.length ? (
                        <span className="flex flex-wrap gap-1">
                          {failedChecks.map((k) => (
                            <Badge key={k} tone="bad">
                              {k}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </td>
                    <td className={tdNum}>{typeof c.seconds === "number" ? `${c.seconds} s` : <V>{NA}</V>}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Block>
    </div>
  );
}
