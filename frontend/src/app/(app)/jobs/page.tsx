"use client";

import { Briefcase, Gauge, RefreshCw, Search, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiWorking, EmptyState, ErrorNote, Loading } from "@/components/feedback";
import { fill, JobCard, JobMeta, MatchRing } from "@/components/jobs";
import { ClawArt } from "@/components/sketch/illustrations";
import { Button } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Field, Segmented, Select, Textarea } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { JobItem, JobsResponse, SavedJob, TrackStatus } from "@/lib/types";
import { fmtDate, timeAgo } from "@/lib/utils";

const PAGE = 10;
const STATUSES: TrackStatus[] = ["saved", "applied", "interviewing", "offer", "rejected"];

type Filters = { city: string; type: string; level: string; remote: "any" | "remote" | "onsite"; sort: "match" | "newest" };
const NO_FILTERS: Filters = { city: "", type: "", level: "", remote: "any", sort: "match" };

function query(f: Filters, offset: number) {
  const p = new URLSearchParams({ remote: f.remote, sort: f.sort, offset: String(offset), limit: String(PAGE) });
  if (f.city) p.set("city", f.city);
  if (f.type) p.set("type", f.type);
  if (f.level) p.set("level", f.level);
  return `/api/jobs/recommendations?${p}`;
}

export default function JobsPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { pending, run } = useAction();

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [data, setData] = useState<JobsResponse | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const autoRefreshed = useRef(false);
  const saved = useApi<SavedJob[]>("/api/jobs/saved");

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const res = await api<JobsResponse>(query(f, 0));
      setData(res);
      setItems(res.items);
      setError(null);
      return res;
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async (force = false, quiet = false) => {
      setRefreshing(true);
      setError(null);
      try {
        const res = await api<JobsResponse>("/api/jobs/refresh", { method: "POST", json: { force } });
        setFilters(NO_FILTERS);
        setData(res);
        setItems(res.items);
        const r = res.refresh;
        if (r && !quiet) {
          const calls = Object.values(r.calls).reduce((a, b) => a + b, 0);
          toast("ok", fill(t("jobs.found"), { n: r.found, c: calls, h: r.cache_hits }));
          if (r.errors.length) toast("info", t("jobs.source.error"));
          else if (r.skipped.length) toast("info", t("jobs.skipped"));
        }
      } catch (e) {
        const err = e as ApiError;
        const reason = (err.detail as { reason?: string } | undefined)?.reason;
        if (err.status === 429) toast("info", t(reason === "daily_limit" ? "jobs.dailylimit" : "jobs.cooldown"));
        else if (err.status === 503 && err.code !== "ai_unavailable") toast("error", t("jobs.notconfigured"));
        else setError(err);
      } finally {
        setRefreshing(false);
      }
    },
    [t, toast],
  );

  // first visit / CV changed -> search automatically (cache first on the server, so this is usually free)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    load(NO_FILTERS).then((res) => {
      if (!res || autoRefreshed.current) return;
      if (res.state === "needs_refresh" || (res.cv_changed && res.can_refresh)) {
        autoRefreshed.current = true;
        refresh(false, true);
      }
    });
  }, [load, refresh]);

  function setFilter<K extends keyof Filters>(k: K, v: Filters[K]) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    load(next);
  }

  async function loadMore() {
    setMore(true);
    try {
      const res = await api<JobsResponse>(query(filters, items.length));
      setItems((cur) => [...cur, ...res.items.filter((j) => !cur.some((c) => c.id === j.id))]);
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setMore(false);
    }
  }

  function patchItem(id: string, saved: JobItem["saved"]) {
    setItems((cur) => cur.map((j) => (j.id === id ? { ...j, saved } : j)));
  }

  async function onSave(job: JobItem) {
    if (job.saved) {
      await run(`save:${job.id}`, async () => {
        await api(`/api/jobs/saved/${job.saved!.id}`, { method: "DELETE" });
        patchItem(job.id, null);
        toast("ok", t("jobs.toast.removed"));
        saved.reload();
      }, (e) => toast("error", e.message));
      return;
    }
    await run(`save:${job.id}`, async () => {
      const s = await api<SavedJob>("/api/jobs/saved", { method: "POST", json: { listing_id: job.id } });
      patchItem(job.id, { id: s.id, status: s.status });
      toast("ok", t("jobs.toast.saved"));
      saved.reload();
    }, (e) => toast("error", e.message));
  }

  async function onTrack(job: JobItem, status: TrackStatus) {
    await run(`track:${job.id}`, async () => {
      const s = await api<SavedJob>("/api/jobs/saved", { method: "POST", json: { listing_id: job.id, status } });
      patchItem(job.id, { id: s.id, status: s.status });
      toast("ok", t(status === "applied" ? "jobs.toast.applied" : "jobs.toast.saved"));
      saved.reload();
    }, (e) => toast("error", e.message));
  }

  const profile = data?.profile;
  const facets = data?.facets;
  const filtered = filters.city || filters.type || filters.level || filters.remote !== "any";
  const total = data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title={t("jobs.title")}
        sub={t("jobs.sub")}
        art={<ClawArt className="h-28 w-auto" />}
        actions={
          data?.state !== "no_cv" && (
            <div className="flex flex-col items-end gap-1">
              <Button onClick={() => refresh(true)} loading={refreshing} disabled={refreshing || data?.refresh_blocked === "daily_limit"}>
                {!refreshing && <RefreshCw />}
                {refreshing ? t("jobs.refreshing") : t("jobs.refresh")}
              </Button>
              <span className="text-xs text-ink-faint">
                {data?.last_refreshed_at ? `${t("jobs.updated")} ${timeAgo(data.last_refreshed_at)}` : t("jobs.never")}
              </span>
            </div>
          )
        }
      />

      {data?.state === "no_cv" && (
        <EmptyState
          title={t("jobs.nocv")}
          text={t("jobs.nocv.d")}
          action={
            <Button asChild>
              <Link href="/cv">{t("nav.cv")}</Link>
            </Button>
          }
        />
      )}

      {data && data.state !== "no_cv" && (
        <Tabs defaultValue="recommended">
          <TabsList>
            <TabsTrigger value="recommended">
              <Search className="me-1.5 inline size-4" />
              {t("jobs.tab.recommended")}
              {total > 0 && ` (${total})`}
            </TabsTrigger>
            <TabsTrigger value="saved">
              <Briefcase className="me-1.5 inline size-4" />
              {t("jobs.tab.saved")}
              {saved.data?.length ? ` (${saved.data.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="flex flex-col gap-6">
            {profile && (
              <Card tone="sky" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <UserRound className="size-5" />
                  <span className="font-hand text-xl">{t("jobs.profile")}</span>
                  {profile.target_titles.map((title) => (
                    <Badge key={title} className="bg-paper text-sm text-ink">{title}</Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
                  <span>
                    {t("jobs.profile.level")}: <b className="text-ink">{t(`jobs.level.${profile.level}` as TKey)}</b>
                    {profile.include_internships && ` · ${t("jobs.profile.internships")}`}
                  </span>
                  <span>~{profile.years} {t("jobs.profile.years")}</span>
                  <span className="text-xs text-ink-faint">{t("jobs.profile.basis")}</span>
                </div>
                {data.cv_changed && <p className="rounded-xl bg-warn-fill p-2 text-sm">{t("jobs.cvchanged")}</p>}
              </Card>
            )}

            <ErrorNote error={error} onRetry={() => load(filters)} />

            {refreshing && (
              <AiWorking steps={[t("jobs.steps.cv"), t("jobs.steps.search"), t("jobs.steps.dedupe"), t("jobs.steps.match")]} />
            )}

            {(data.state === "ok" || filtered) && (
              <Card tone="tint" className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("jobs.filter.city")}>
                  <Select value={filters.city} onChange={(e) => setFilter("city", e.target.value)}>
                    <option value="">{t("jobs.filter.any")}</option>
                    {facets?.cities.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.value === "Other" ? t("jobs.city.Other") : c.value} ({c.count})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("jobs.filter.type")}>
                  <Select value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
                    <option value="">{t("jobs.filter.any")}</option>
                    {facets?.types.map((c) => (
                      <option key={c.value} value={c.value}>
                        {t(`jobs.type.${c.value}` as TKey)} ({c.count})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("jobs.filter.level")}>
                  <Select value={filters.level} onChange={(e) => setFilter("level", e.target.value)}>
                    <option value="">{t("jobs.filter.any")}</option>
                    {facets?.levels.map((c) => (
                      <option key={c.value} value={c.value}>
                        {t(`jobs.level.${c.value}` as TKey)} ({c.count})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("jobs.filter.sort")}>
                  <Select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value as Filters["sort"])}>
                    <option value="match">{t("jobs.sort.match")}</option>
                    <option value="newest">{t("jobs.sort.newest")}</option>
                  </Select>
                </Field>
                <Field label={t("jobs.filter.remote")} group className="sm:col-span-2 lg:col-span-3">
                  <Segmented
                    ariaLabel={t("jobs.filter.remote")}
                    value={filters.remote}
                    onChange={(v) => setFilter("remote", v)}
                    options={(["any", "remote", "onsite"] as const).map((v) => ({ value: v, label: t(`jobs.remote.${v}`) }))}
                  />
                </Field>
                {filtered && (
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm" onClick={() => { setFilters(NO_FILTERS); load(NO_FILTERS); }}>
                      {t("jobs.filter.reset")}
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {loading && !items.length && !refreshing && <Loading />}

            {!loading && !refreshing && items.length === 0 && (data.state === "empty" || data.state === "needs_refresh" || filtered) && (
              <EmptyState
                title={filtered ? t("jobs.nofilter") : t("jobs.empty")}
                text={filtered ? undefined : t("jobs.empty.d")}
                action={
                  filtered ? (
                    <Button variant="outline" onClick={() => { setFilters(NO_FILTERS); load(NO_FILTERS); }}>
                      {t("jobs.filter.reset")}
                    </Button>
                  ) : (
                    <Button onClick={() => refresh(true)} loading={refreshing}>
                      <RefreshCw /> {t("jobs.refresh")}
                    </Button>
                  )
                }
              />
            )}

            {items.length > 0 && (
              <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
                <div className="grid gap-5 xl:grid-cols-2">
                  {items.map((job) => (
                    <JobCard key={job.id} job={job} pending={pending} onSave={onSave} onTrack={onTrack} />
                  ))}
                </div>
                <div className="mt-6 flex flex-col items-center gap-2">
                  <span className="text-sm text-ink-faint">{fill(t("jobs.showing"), { n: items.length, t: total })}</span>
                  {items.length < total && (
                    <Button variant="outline" onClick={loadMore} loading={more}>
                      {t("jobs.more")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <UsageNote data={data} />
          </TabsContent>

          <TabsContent value="saved">
            <Tracker rows={saved.data} loading={saved.loading} error={saved.error} reload={saved.reload}
              onChanged={(row) => patchItem(row.listing_id ?? "", row.status ? { id: row.id, status: row.status } : null)}
              locale={locale} />
          </TabsContent>
        </Tabs>
      )}

      {!data && loading && <Loading />}
      {!data && !loading && <ErrorNote error={error} onRetry={() => load(filters)} />}
    </div>
  );
}

function UsageNote({ data }: { data: JobsResponse }) {
  const { t } = useI18n();
  const rows = (["jsearch", "serpapi"] as const).filter((p) => data.usage[p]?.configured);
  if (!rows.length) return null;
  return (
    <div className="sketch-dashed flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5 font-semibold text-ink">
        <Gauge className="size-4" /> {t("jobs.usage")}
      </span>
      {rows.map((p) => (
        <span key={p}>
          {p === "jsearch" ? "JSearch" : "Google Jobs (SerpApi)"}: <b className="text-ink">{data.usage[p].used}</b> / {data.usage[p].limit}
        </span>
      ))}
      <span className="basis-full text-ink-faint">{t("jobs.usage.d")}</span>
    </div>
  );
}

function Tracker({
  rows,
  loading,
  error,
  reload,
  onChanged,
  locale,
}: {
  rows: SavedJob[] | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  onChanged: (row: { id: string; listing_id: string | null; status: TrackStatus | null }) => void;
  locale: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function patch(row: SavedJob, body: Partial<Pick<SavedJob, "status" | "notes">>) {
    try {
      const r = await api<SavedJob>(`/api/jobs/saved/${row.id}`, { method: "PATCH", json: body });
      if (body.status) onChanged({ id: r.id, listing_id: r.listing_id, status: r.status });
      reload();
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  async function remove(row: SavedJob) {
    try {
      await api(`/api/jobs/saved/${row.id}`, { method: "DELETE" });
      onChanged({ id: row.id, listing_id: row.listing_id, status: null });
      toast("ok", t("jobs.toast.removed"));
      reload();
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (loading && !rows) return <Loading />;
  if (!rows?.length) return <EmptyState title={t("jobs.track.empty")} text={t("jobs.track.empty.d")} />;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" aria-label={t("jobs.tab.saved")}>
        {STATUSES.map((s) => (
          <Badge key={s} tone={s === "offer" ? "ok" : s === "rejected" ? "bad" : s === "interviewing" ? "warn" : s === "applied" ? "brand" : "neutral"} className="text-sm">
            {t(`track.${s}` as TKey)}: {counts[s]}
          </Badge>
        ))}
      </div>
      {rows.map((row) => (
        <Card key={row.id} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-hand text-2xl leading-tight" dir="auto">{row.job.title}</h3>
              <div className="text-sm text-ink-soft" dir="auto">
                <b className="text-ink">{row.job.company}</b>
              </div>
              <div className="mt-2">
                <JobMeta job={row.job} />
              </div>
              {row.expired && <Badge tone="warn" className="mt-2">{t("jobs.track.expired")}</Badge>}
              {row.applied_at && (
                <p className="mt-2 text-xs text-ink-faint">
                  {t("jobs.track.applied_on")}: {fmtDate(row.applied_at, locale)}
                </p>
              )}
            </div>
            {row.match_score !== null && <MatchRing score={Math.round(row.match_score)} size={60} label={t("jobs.match")} />}
          </div>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <Field label={t("jobs.track")}>
              <Select value={row.status} onChange={(e) => patch(row, { status: e.target.value as TrackStatus })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`track.${s}` as TKey)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("jobs.track.notes")}>
              <Textarea
                className="min-h-11"
                rows={1}
                maxLength={2000}
                dir="auto"
                value={notes[row.id] ?? row.notes}
                onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                onBlur={() => notes[row.id] !== undefined && notes[row.id] !== row.notes && patch(row, { notes: notes[row.id] })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {row.job.apply_url && !row.expired && (
              <Button asChild size="sm">
                <a href={row.job.apply_url} target="_blank" rel="noopener noreferrer nofollow">{t("jobs.apply")}</a>
              </Button>
            )}
            {row.listing_id && !row.expired && (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/tailor?job=${row.listing_id}`}>{t("jobs.tailor")}</Link>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => remove(row)}>
              <Trash2 /> {t("jobs.track.remove")}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
