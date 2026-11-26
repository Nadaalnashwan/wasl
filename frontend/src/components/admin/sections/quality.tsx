"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/feedback";
import { Badge } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { C, HBars, SegmentBar } from "../charts";
import { useMetrics } from "../context";
import type { DefKey } from "../definitions";
import { fmtNum, fmtPct, rateOf } from "../format";
import { Block, Definitions, FilterBar, InfoTip, Kpi, KpiStrip, LastUpdated, Mono, NoData, QueryGate, Sample, SectionHeader, TableWrap, td, tdNum, th, ThInfo, V } from "../primitives";
import type { ClaimStage } from "../types";

const STAGES: { key: "raw" | "final" | "approved"; name: string; desc: string; def: DefKey }[] = [
  { key: "raw", name: "Raw model output", desc: "before enforcement", def: "raw_unsupported" },
  { key: "final", name: "Delivered to user", desc: "after revise / removal", def: "final_unsupported" },
  { key: "approved", name: "Approved / published", desc: "user-accepted output", def: "approved_unsupported" },
];

function RateCell({ checked, unsupported }: { checked: number; unsupported: number }) {
  return (
    <span className="inline-flex flex-col items-end">
      <V>{fmtPct(rateOf(checked ? unsupported / checked : null, checked))}</V>
      <span className="num text-[11px] text-fg-3">
        {fmtNum(unsupported)} / {fmtNum(checked)}
      </span>
    </span>
  );
}

export function QualityView() {
  const { t } = useI18n();
  const m = useMetrics({ task: true });
  const d = m.data;
  const q = d?.quality;

  return (
    <>
      <SectionHeader title={t("admin2.nav.quality")} sub={t("admin2.quality.sub")} right={<LastUpdated at={m.fetchedAt} loading={m.loading} onRefresh={m.reload} />} />
      <FilterBar dims={["days", "task"]} options={d?.options} note="Quality events are recorded per task, so provider and model filters do not apply here." />
      <QueryGate queries={[m]}>
        {q && (
          <div className="flex flex-col gap-10">
            {q.unsupported_escaped > 0 ? (
              <Notice tone="bad" icon={<ShieldAlert className="text-bad" />} title={`${fmtNum(q.unsupported_escaped)} unsupported claim(s) escaped enforcement`}>
                An unacknowledged unsupported claim reached approved or published output. Treat this as a quality incident and reproduce it with the evaluation suite.
              </Notice>
            ) : (
              q.claims_by_stage.raw.claims_checked + q.claims_by_stage.final.claims_checked > 0 && (
                <Notice tone="ok" icon={<ShieldCheck className="text-ok" />} title="No unsupported claims escaped enforcement in this window" />
              )
            )}

            <KpiStrip cols={4}>
              <Kpi
                label="Raw unsupported rate"
                def="raw_unsupported"
                value={fmtPct(q.claims_by_stage.raw.unsupported_rate)}
                sample={<Sample n={q.claims_by_stage.raw.claims_checked} unit="claims" />}
                hint="before enforcement"
              />
              <Kpi
                label="Post-enforcement rate"
                def="final_unsupported"
                value={fmtPct(q.claims_by_stage.final.unsupported_rate)}
                sample={<Sample n={q.claims_by_stage.final.claims_checked} unit="claims" />}
                hint="what users receive"
              />
              <Kpi label="Blocked by enforcement" def="blocked" value={fmtNum(q.unsupported_blocked)} hint="raw − delivered" />
              <Kpi label="Escaped" def="escaped" value={fmtNum(q.unsupported_escaped)} tone={q.unsupported_escaped > 0 ? "bad" : undefined} hint="approved & unacknowledged" />
            </KpiStrip>

            <Block
              title="Claim verification by stage"
              def="claims_checked"
              description="Each AI output is checked against the user's evidence at up to three stages."
              action={
                q.verifier_versions.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1 text-xs text-fg-3">
                    Verifier
                    {q.verifier_versions.map((v) => (
                      <Badge key={v} tone="outline">
                        {v}
                      </Badge>
                    ))}
                  </span>
                )
              }
            >
              <TableWrap label="Claim verification by stage">
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      Stage
                    </th>
                    <ThInfo num>Outputs</ThInfo>
                    <ThInfo num def="claims_checked">
                      Claims checked
                    </ThInfo>
                    <ThInfo num>Unsupported rate</ThInfo>
                    <ThInfo num>Outputs with ≥1 unsupported</ThInfo>
                    <ThInfo num>Contradicted</ThInfo>
                    <ThInfo num>Ambiguous</ThInfo>
                    <ThInfo num>Needs confirmation</ThInfo>
                    <ThInfo num>Verifier unavailable</ThInfo>
                    <ThInfo num>Acknowledged</ThInfo>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((s) => {
                    const st: ClaimStage = q.claims_by_stage[s.key];
                    return (
                      <tr key={s.key}>
                        <th scope="row" className={`${td} text-start font-normal`}>
                          <span className="flex items-center gap-1 font-medium">
                            {s.name} <InfoTip def={s.def} />
                          </span>
                          <span className="text-xs text-fg-3">{s.desc}</span>
                        </th>
                        <td className={tdNum}>{fmtNum(st.outputs)}</td>
                        <td className={tdNum}>{fmtNum(st.claims_checked)}</td>
                        <td className={tdNum}>
                          <RateCell checked={st.claims_checked} unsupported={st.unsupported} />
                        </td>
                        <td className={tdNum}>
                          {fmtNum(st.outputs_with_unsupported)} / {fmtNum(st.outputs)}
                        </td>
                        <td className={tdNum}>{fmtNum(st.contradicted)}</td>
                        <td className={tdNum}>{fmtNum(st.ambiguous)}</td>
                        <td className={tdNum}>{fmtNum(st.needs_confirmation)}</td>
                        <td className={tdNum}>
                          <span className={st.unavailable > 0 ? "text-warn" : undefined}>{fmtNum(st.unavailable)}</span>
                        </td>
                        <td className={tdNum}>{fmtNum(st.acknowledged)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </Block>

            <ByTask stages={q.claims_by_stage} />

            <div className="grid gap-8 lg:grid-cols-3">
              <Block title="CV suggestion decisions" def="cv_acceptance">
                {(() => {
                  const c = q.cv_decisions;
                  const n = c.accepted + c.edited + c.rejected;
                  return (
                    <div className="flex flex-col gap-4 ink-soft p-4">
                      <Kpi label="Acceptance rate" def="cv_acceptance" value={fmtPct(q.cv_acceptance_rate)} sample={<Sample n={n} unit="decisions" />} />
                      {n > 0 ? (
                        <SegmentBar
                          label="CV suggestion decisions"
                          parts={[
                            { key: "accepted", name: "Accepted", value: c.accepted, color: C.c1 },
                            { key: "edited", name: "Edited", value: c.edited, color: C.c3 },
                            { key: "rejected", name: "Rejected", value: c.rejected, color: C.c2 },
                          ]}
                        />
                      ) : (
                        <p className="text-xs text-fg-3">No decisions recorded in this window.</p>
                      )}
                    </div>
                  );
                })()}
              </Block>
              <Block title="Extraction feedback" def="extraction_precision">
                {(() => {
                  const f = q.achievement_feedback;
                  const n = f.confirmed + f.rejected;
                  return (
                    <div className="flex flex-col gap-4 ink-soft p-4">
                      <Kpi label="Extraction precision (proxy)" def="extraction_precision" value={fmtPct(q.extraction_precision)} sample={<Sample n={n} unit="reviewed" />} />
                      {n > 0 ? (
                        <SegmentBar
                          label="Achievement feedback"
                          parts={[
                            { key: "confirmed", name: "Confirmed", value: f.confirmed, color: C.c1 },
                            { key: "rejected", name: "Rejected", value: f.rejected, color: C.c2 },
                          ]}
                        />
                      ) : (
                        <p className="text-xs text-fg-3">No achievement reviews recorded in this window.</p>
                      )}
                    </div>
                  );
                })()}
              </Block>
              <Block title="Safety & publishing">
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 ink-soft p-4 text-sm">
                  <dt className="flex items-center gap-1 text-fg-3">
                    Prompt-injection flags <InfoTip def="injection_flags" />
                  </dt>
                  <dd className="num text-end text-fg">{fmtNum(q.injection_flags)}</dd>
                  <dt className="text-fg-3">Outputs checked (delivered)</dt>
                  <dd className="num text-end text-fg">{fmtNum(q.outputs_checked)}</dd>
                  <dt className="col-span-2 mt-2 text-xs font-medium text-fg-2">LinkedIn publish results</dt>
                  {Object.keys(q.publish).length === 0 ? (
                    <dd className="col-span-2 text-xs text-fg-3">No publish attempts in this window.</dd>
                  ) : (
                    Object.entries(q.publish).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-fg-3">{k}</dt>
                        <dd className="num text-end text-fg">{fmtNum(v)}</dd>
                      </div>
                    ))
                  )}
                </dl>
              </Block>
            </div>

            <Block title="Task completion" def="task_success" description="End-to-end success per user task — validation, AI, verification and database writes.">
              {q.task_completion.length === 0 ? (
                <NoData text="No task_completed / task_failed events in this window." />
              ) : (
                <TableWrap label="Task completion">
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        Task
                      </th>
                      <ThInfo num def="task_success">
                        Success rate
                      </ThInfo>
                      <ThInfo num>Completed</ThInfo>
                      <ThInfo num>Failed</ThInfo>
                    </tr>
                  </thead>
                  <tbody>
                    {q.task_completion.map((r) => {
                      const n = r.completed + r.failed;
                      return (
                        <tr key={r.task}>
                          <td className={td}>
                            <Mono>{r.task}</Mono>
                          </td>
                          <td className={tdNum}>
                            <span className={n && r.rate < 0.7 ? "text-bad" : n && r.rate < 0.9 ? "text-warn" : undefined}>
                              <V>{fmtPct(rateOf(r.rate, n))}</V>
                            </span>
                            <span className="num ms-2 text-[11px] text-fg-3">n = {n}</span>
                          </td>
                          <td className={tdNum}>{fmtNum(r.completed)}</td>
                          <td className={tdNum}>{fmtNum(r.failed)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
              <p className="mt-2 text-xs text-fg-3">
                Overall task success: <span className="num font-medium text-fg-2">{fmtPct(q.task_success_rate)}</span>
              </p>
            </Block>

            <Definitions keys={["raw_unsupported", "final_unsupported", "approved_unsupported", "blocked", "escaped", "claims_checked", "cv_acceptance", "extraction_precision", "task_success", "injection_flags", "sample"]} />
          </div>
        )}
      </QueryGate>
    </>
  );
}

function ByTask({ stages }: { stages: Record<"raw" | "final" | "approved", ClaimStage> }) {
  const tasks = Array.from(new Set([...Object.keys(stages.raw.by_task), ...Object.keys(stages.final.by_task), ...Object.keys(stages.approved.by_task)])).sort();
  const get = (s: "raw" | "final" | "approved", task: string) => stages[s].by_task[task] ?? { claims_checked: 0, unsupported: 0 };
  return (
    <Block title="Unsupported claims by task" description="Raw vs delivered unsupported claims show where enforcement does the work.">
      {tasks.length === 0 ? (
        <NoData text="No claim checks recorded in this window." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <HBars
            rows={tasks.map((task) => ({ task, raw: get("raw", task).unsupported, final: get("final", task).unsupported }))}
            labelKey="task"
            labelHeader="Task"
            xFormat={(v) => fmtNum(v)}
            summary="Unsupported claims per task before enforcement (raw) and in delivered output."
            series={[
              { key: "raw", name: "Raw (before enforcement)", color: C.c2, format: fmtNum },
              { key: "final", name: "Delivered to user", color: C.c1, format: fmtNum },
            ]}
          />
          <TableWrap label="Unsupported rate by task and stage">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Task
                </th>
                <ThInfo num def="raw_unsupported">
                  Raw
                </ThInfo>
                <ThInfo num def="final_unsupported">
                  Delivered
                </ThInfo>
                <ThInfo num def="approved_unsupported">
                  Approved
                </ThInfo>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task}>
                  <td className={td}>
                    <Mono>{task}</Mono>
                  </td>
                  {(["raw", "final", "approved"] as const).map((s) => (
                    <td key={s} className={tdNum}>
                      <RateCell checked={get(s, task).claims_checked} unsupported={get(s, task).unsupported} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}
    </Block>
  );
}
