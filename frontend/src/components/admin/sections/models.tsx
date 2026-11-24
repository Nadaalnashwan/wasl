"use client";

import { AlertTriangle } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useAdminQuery, useMetrics } from "../context";
import { fmtMs, fmtNum, fmtPct, fmtUsd, NA, rateOf } from "../format";
import { Block, Definitions, FilterBar, InfoTip, LastUpdated, Mono, NoData, QueryGate, SectionHeader, TableWrap, td, tdNum, th, ThInfo, V } from "../primitives";
import type { Registry, RegistryRoute } from "../types";

const PRIVACY_TONE: Record<string, BadgeTone> = { zdr: "ok", limited_retention: "warn", none: "bad" };

export function PrivacyBadge({ level }: { level: string }) {
  return <Badge tone={PRIVACY_TONE[level] ?? "outline"}>{level.replace(/_/g, " ")}</Badge>;
}

function price(r: RegistryRoute | null) {
  if (!r?.price_per_mtok) return NA;
  return `$${r.price_per_mtok.input} / $${r.price_per_mtok.output}`;
}

export function ModelsView() {
  const { t } = useI18n();
  const reg = useAdminQuery<Registry>("/api/admin/monitoring/models");
  const m = useMetrics();
  const r = reg.data;
  const d = m.data;

  // one privacy row per provider (the level does not depend on the task)
  const providers = r
    ? r.provider_priority.map((p) => {
        const route = r.tasks.flatMap((t) => t.routes).find((x) => x.provider === p);
        const personal = r.tasks.filter((t) => t.sensitivity === "personal");
        const okPersonal = personal.some((t) => t.routes.some((x) => x.provider === p && x.eligible));
        const obs = d?.ai.providers.find((x) => x.provider === p);
        return { provider: p, level: route?.privacy_level ?? "none", basis: route?.privacy_basis ?? "", okPersonal, obs };
      })
    : [];

  return (
    <>
      <SectionHeader
        title={t("admin2.nav.models")}
        sub={t("admin2.models.sub")}
        right={
          <LastUpdated
            at={m.fetchedAt}
            loading={reg.loading || m.loading}
            onRefresh={() => {
              reg.reload();
              m.reload();
            }}
          />
        }
      />
      <FilterBar dims={["days", "provider", "model", "task"]} options={d?.options} note="Filters apply to observed usage; the registry is the current configuration." />
      <QueryGate queries={[reg, m]}>
        {r && d && (
          <div className="flex flex-col gap-10">
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-surface [&>div]:px-4 [&>div]:py-3">
              <div>
                <dt className="text-xs text-fg-3">Registry version</dt>
                <dd className="mt-1">
                  <Mono>{r.registry_version}</Mono>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-3">Pricing version</dt>
                <dd className="mt-1">
                  <Mono>{r.pricing_version}</Mono>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-fg-3">
                  Personal-data minimum <InfoTip def="privacy_level" />
                </dt>
                <dd className="mt-1">
                  <PrivacyBadge level={r.personal_min_privacy} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-3">Provider priority</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-1">
                  {r.provider_priority.length ? (
                    r.provider_priority.map((p, i) => (
                      <Badge key={p} tone="outline">
                        <span className="num text-fg-3">{i + 1}.</span> {p}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-warn">none configured</span>
                  )}
                </dd>
              </div>
            </dl>

            <Block title="Providers" def="privacy_level" description="Privacy level Wasl can guarantee with platform keys, and observed attempts in the selected window.">
              {providers.length === 0 ? (
                <NoData title="No providers configured" text="Set provider keys and AI_PROVIDER_PRIORITY in the backend environment." />
              ) : (
                <TableWrap label="Providers">
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        Provider
                      </th>
                      <ThInfo def="privacy_level">Privacy level</ThInfo>
                      <th scope="col" className={th}>
                        Personal data
                      </th>
                      <ThInfo num def="provider_attempts">
                        Attempts
                      </ThInfo>
                      <ThInfo num>Success rate</ThInfo>
                      <ThInfo num def="attempt_latency">
                        Attempt p95
                      </ThInfo>
                      <th scope="col" className={th}>
                        Basis
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.provider}>
                        <td className={`${td} font-medium`}>{p.provider}</td>
                        <td className={td}>
                          <PrivacyBadge level={p.level} />
                        </td>
                        <td className={`${td} text-xs`}>{p.okPersonal ? <span className="text-ok">eligible</span> : <span className="text-fg-3">excluded</span>}</td>
                        <td className={tdNum}>{fmtNum(p.obs?.attempts ?? 0)}</td>
                        <td className={tdNum}>
                          <V>{fmtPct(rateOf(p.obs?.success_rate ?? null, p.obs?.attempts ?? 0))}</V>
                        </td>
                        <td className={tdNum}>
                          <V>{fmtMs(p.obs?.p95_latency_ms ?? null)}</V>
                        </td>
                        <td className={`${td} max-w-sm text-xs whitespace-normal text-fg-2`}>{p.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Block>

            <Block title="Task routing" description="Primary = first privacy-eligible provider in priority order; fallbacks are the remaining eligible ones. Prices are list prices per million tokens (input / output).">
              <TableWrap label="Task routing">
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      Task
                    </th>
                    <th scope="col" className={th}>
                      Tier · data
                    </th>
                    <th scope="col" className={th}>
                      Primary
                    </th>
                    <th scope="col" className={th}>
                      Fallbacks
                    </th>
                    <ThInfo num>Price / Mtok</ThInfo>
                    <ThInfo num>Temp</ThInfo>
                    <ThInfo num>Max tokens</ThInfo>
                    <ThInfo num>Timeout · retries</ThInfo>
                  </tr>
                </thead>
                <tbody>
                  {r.tasks.map((task) => {
                    const excluded = task.routes.filter((x) => !x.eligible);
                    return (
                      <tr key={task.name}>
                        <td className={`${td} max-w-xs whitespace-normal`}>
                          <Mono>{task.name}</Mono>
                          <div className="mt-1 text-xs text-fg-3">{task.description}</div>
                        </td>
                        <td className={`${td} text-xs`}>
                          <div>{task.tier}</div>
                          <Badge tone={task.sensitivity === "personal" ? "brand" : "neutral"}>{task.sensitivity}</Badge>
                        </td>
                        <td className={`${td} text-xs`}>
                          {task.primary ? (
                            <>
                              <div className="font-medium">{task.primary.provider}</div>
                              <div className="text-fg-3">{task.primary.model}</div>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-bad">
                              <AlertTriangle className="size-3.5" aria-hidden /> No eligible provider
                            </span>
                          )}
                        </td>
                        <td className={`${td} text-xs`}>
                          {task.fallbacks.length === 0 ? (
                            <span className="text-fg-3">none</span>
                          ) : (
                            <ul className="flex flex-col gap-0.5">
                              {task.fallbacks.map((f) => (
                                <li key={f.provider}>
                                  {f.provider} <span className="text-fg-3">{f.model}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {excluded.length > 0 && <div className="mt-1 text-fg-3">privacy-excluded: {excluded.map((x) => x.provider).join(", ")}</div>}
                        </td>
                        <td className={tdNum}>
                          <V>{price(task.primary)}</V>
                        </td>
                        <td className={tdNum}>{task.temperature}</td>
                        <td className={tdNum}>{fmtNum(task.max_tokens)}</td>
                        <td className={tdNum}>
                          {task.timeout_s}s · {task.max_retries}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </Block>

            <Block title="Observed models" def="returned_model" description="Requested model ids vs the ids providers reported back, in the selected window.">
              {d.models.length === 0 ? (
                <NoData />
              ) : (
                <TableWrap label="Observed models">
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        Provider · requested model
                      </th>
                      <ThInfo def="returned_model">Returned model ids</ThInfo>
                      <ThInfo num def="provider_attempts">
                        Attempts
                      </ThInfo>
                      <ThInfo num>Success rate</ThInfo>
                      <ThInfo num def="attempt_latency">
                        p50
                      </ThInfo>
                      <ThInfo num def="attempt_latency">
                        p95
                      </ThInfo>
                      <ThInfo num>Tokens in / out</ThInfo>
                      <ThInfo num def="est_cost">
                        Est. cost
                      </ThInfo>
                      <ThInfo num def="fallback_rate">
                        Fallback wins
                      </ThInfo>
                    </tr>
                  </thead>
                  <tbody>
                    {d.models.map((x) => {
                      const returned = Object.entries(x.returned_models);
                      return (
                        <tr key={`${x.provider}/${x.model}`}>
                          <td className={`${td} text-xs`}>
                            <div className="font-medium">{x.provider}</div>
                            <Mono>{x.model}</Mono>
                          </td>
                          <td className={`${td} text-xs`}>
                            {returned.length === 0 ? (
                              <V>{NA}</V>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {returned.map(([id, n]) => (
                                  <li key={id} className="flex flex-wrap items-center gap-1.5">
                                    <Mono>{id}</Mono>
                                    <span className="num text-fg-3">×{fmtNum(n)}</span>
                                    {id !== x.model && <Badge tone="warn">differs</Badge>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className={tdNum}>{fmtNum(x.attempts)}</td>
                          <td className={tdNum}>
                            <V>{fmtPct(rateOf(x.success_rate, x.attempts))}</V>
                          </td>
                          <td className={tdNum}>
                            <V>{fmtMs(x.p50_ms)}</V>
                          </td>
                          <td className={tdNum}>
                            <V>{fmtMs(x.p95_ms)}</V>
                          </td>
                          <td className={tdNum}>
                            {fmtNum(x.prompt_tokens)} / {fmtNum(x.completion_tokens)}
                          </td>
                          <td className={tdNum}>
                            <V>{fmtUsd(x.est_cost_usd)}</V>
                          </td>
                          <td className={tdNum}>{fmtNum(x.fallback_successes)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
            </Block>

            <Definitions keys={["privacy_level", "returned_model", "provider_attempts", "attempt_latency", "est_cost", "sample"]} />
          </div>
        )}
      </QueryGate>
    </>
  );
}
