"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AiWorking, EmptyState, ErrorNote, Notice, SkeletonRows } from "@/components/feedback";
import { fill } from "@/components/jobs";
import { JobDetail } from "@/components/jobs/detail";
import { FilterBar, type Filters, isFiltered, NO_FILTERS, ResultsList } from "@/components/jobs/results";
import { Tracker } from "@/components/jobs/tracker";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Dialog, DrawerContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { JobItem, JobsResponse, SavedJob, TrackStatus } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const PAGE = 10;
const SPLIT_QUERY = "(min-width: 1280px)";

function query(f: Filters, offset: number) {
  const p = new URLSearchParams({ remote: f.remote, sort: f.sort, offset: String(offset), limit: String(PAGE) });
  if (f.city) p.set("city", f.city);
  if (f.type) p.set("type", f.type);
  if (f.level) p.set("level", f.level);
  return `/api/jobs/recommendations?${p}`;
}

function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export default function JobsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { pending, run } = useAction();
  const split = useMediaQuery(SPLIT_QUERY);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [data, setData] = useState<JobsResponse | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
          toast("ok", fill(t("jobs2.found"), { n: r.found }));
          if (r.errors.length) toast("info", t("jobs.source.error"));
          else if (r.skipped.length) toast("info", t("jobs2.skipped"));
        }
      } catch (e) {
        const err = e as ApiError;
        const reason = (err.detail as { reason?: string } | undefined)?.reason;
        if (err.status === 429) toast("info", t(reason === "daily_limit" ? "jobs2.blocked.daily_limit" : "jobs2.blocked.cooldown"));
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
      if (res.providers_configured?.length === 0) return;
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

  function resetFilters() {
    setFilters(NO_FILTERS);
    load(NO_FILTERS);
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

  function patchItem(id: string, s: JobItem["saved"]) {
    setItems((cur) => cur.map((j) => (j.id === id ? { ...j, saved: s } : j)));
  }

  async function onSave(job: JobItem) {
    if (job.saved) {
      await run(
        `save:${job.id}`,
        async () => {
          await api(`/api/jobs/saved/${job.saved!.id}`, { method: "DELETE" });
          patchItem(job.id, null);
          toast("ok", t("jobs.toast.removed"));
          saved.reload();
        },
        (e) => toast("error", e.message),
      );
      return;
    }
    await run(
      `save:${job.id}`,
      async () => {
        const s = await api<SavedJob>("/api/jobs/saved", { method: "POST", json: { listing_id: job.id } });
        patchItem(job.id, { id: s.id, status: s.status });
        toast("ok", t("jobs.toast.saved"));
        saved.reload();
      },
      (e) => toast("error", e.message),
    );
  }

  async function onTrack(job: JobItem, status: TrackStatus) {
    await run(
      `track:${job.id}`,
      async () => {
        const s = await api<SavedJob>("/api/jobs/saved", { method: "POST", json: { listing_id: job.id, status } });
        patchItem(job.id, { id: s.id, status: s.status });
        toast("ok", t(status === "applied" ? "jobs.toast.applied" : "jobs.toast.saved"));
        saved.reload();
      },
      (e) => toast("error", e.message),
    );
  }

  async function onStatus(job: JobItem, status: TrackStatus) {
    if (!job.saved) return onTrack(job, status);
    await run(
      `status:${job.id}`,
      async () => {
        const s = await api<SavedJob>(`/api/jobs/saved/${job.saved!.id}`, { method: "PATCH", json: { status } });
        patchItem(job.id, { id: s.id, status: s.status });
        toast("ok", t(status === "applied" ? "jobs.toast.applied" : "jobs.toast.saved"));
        saved.reload();
      },
      (e) => toast("error", e.message),
    );
  }

  function select(id: string) {
    setSelectedId(id);
    if (!split) setDrawerOpen(true);
  }

  const profile = data?.profile;
  const filtered = isFiltered(filters);
  const total = data?.total ?? 0;
  const noProviders = !!data && (data.providers_configured?.length ?? 0) === 0;
  const blocked = data?.refresh_blocked === "daily_limit";
  const selected = items.find((j) => j.id === selectedId) ?? (split ? items[0] : undefined) ?? null;
  const actions = { pending, onSave, onTrack, onStatus };

  return (
    <div>
      <PageHeader
        title={t("jobs.title")}
        sub={t("jobs.sub")}
        actions={
          data &&
          data.state !== "no_cv" &&
          !noProviders && (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button variant="secondary" onClick={() => refresh(true)} loading={refreshing} disabled={refreshing || blocked}>
                {!refreshing && <RefreshCw />}
                {refreshing ? t("jobs.refreshing") : t("jobs.refresh")}
              </Button>
              <span className="text-xs text-fg-3" aria-live="polite">
                {blocked
                  ? t("jobs2.blocked.daily_limit")
                  : data.last_refreshed_at
                    ? `${t("jobs.updated")} ${timeAgo(data.last_refreshed_at)}`
                    : t("jobs.never")}
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
              {t("jobs.tab.recommended")}
              {total > 0 && <span className="num text-fg-3">{total}</span>}
            </TabsTrigger>
            <TabsTrigger value="saved">
              {t("jobs.tab.saved")}
              {saved.data?.length ? <span className="num text-fg-3">{saved.data.length}</span> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recommended" className="flex flex-col gap-5">
            {profile && (
              <div className="flex flex-col gap-1.5 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-fg-2">
                  <span className="text-fg-3">{t("jobs.profile")}</span>
                  {profile.target_titles.map((title, i) => (
                    <span key={title} className="font-medium text-fg" dir="auto">
                      {title}
                      {i < profile.target_titles.length - 1 && <span className="text-fg-3">,</span>}
                    </span>
                  ))}
                  <span className="text-fg-3">·</span>
                  <span>
                    {t(`jobs.level.${profile.level}` as TKey)}
                    {profile.include_internships && ` · ${t("jobs.profile.internships")}`}
                  </span>
                  <span className="text-fg-3">·</span>
                  <span className="num">
                    ~{profile.years} {t("jobs.profile.years")}
                  </span>
                </p>
                <p className="text-xs text-fg-3">
                  {t("jobs2.profile.change")}{" "}
                  <Link href="/cv" className="font-medium text-primary-text hover:underline">
                    {t("jobs2.profile.edit")}
                  </Link>
                </p>
              </div>
            )}

            {noProviders && <Notice tone="warn" title={t("jobs2.noproviders.t")}>{t("jobs2.noproviders.d")}</Notice>}
            {data.cv_changed && !noProviders && <Notice tone="info">{t("jobs.cvchanged")}</Notice>}

            <ErrorNote error={error} onRetry={() => load(filters)} />

            {refreshing && <AiWorking steps={[t("jobs2.steps.cv"), t("jobs2.steps.search"), t("jobs2.steps.dedupe"), t("jobs2.steps.match")]} />}

            {(data.state === "ok" || filtered) && (
              <div className="border-y border-border py-3">
                <FilterBar filters={filters} facets={data.facets} onChange={setFilter} onReset={resetFilters} />
              </div>
            )}

            {loading && !items.length && !refreshing && <SkeletonRows rows={4} />}

            {!loading && !refreshing && items.length === 0 && (data.state === "empty" || data.state === "needs_refresh" || filtered) && (
              <EmptyState
                title={filtered ? t("jobs.nofilter") : t("jobs.empty")}
                text={filtered ? undefined : t("jobs.empty.d")}
                action={
                  filtered ? (
                    <Button variant="outline" onClick={resetFilters}>
                      {t("jobs.filter.reset")}
                    </Button>
                  ) : noProviders ? undefined : (
                    <Button onClick={() => refresh(true)} loading={refreshing} disabled={blocked}>
                      <RefreshCw /> {t("jobs.refresh")}
                    </Button>
                  )
                }
              />
            )}

            {items.length > 0 && (
              <div className="xl:grid xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] xl:items-start xl:gap-6">
                <div
                  className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}
                  aria-busy={loading}
                  aria-live="polite"
                >
                  <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                    <ResultsList items={items} selectedId={selected?.id ?? null} onSelect={select} />
                    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
                      <span className="num text-xs text-fg-3">{fill(t("jobs.showing"), { n: items.length, t: total })}</span>
                      {items.length < total && (
                        <Button variant="outline" size="sm" onClick={loadMore} loading={more}>
                          {t("jobs.more")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {split && (
                  <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl border border-border bg-surface shadow-sm">
                    {selected ? (
                      <JobDetail key={selected.id} item={selected} {...actions} />
                    ) : (
                      <p className="px-5 py-12 text-center text-sm text-fg-3">{t("jobs2.select")}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="saved">
            <Tracker
              rows={saved.data}
              loading={saved.loading}
              error={saved.error}
              reload={saved.reload}
              onChanged={(row) => patchItem(row.listing_id ?? "", row.status ? { id: row.id, status: row.status } : null)}
            />
          </TabsContent>
        </Tabs>
      )}

      {!split && (
        <Dialog open={drawerOpen && !!selected} onOpenChange={setDrawerOpen}>
          {selected && (
            <DrawerContent title={selected.title} description={selected.company || undefined}>
              <JobDetail key={selected.id} item={selected} {...actions} className="-mx-5 -my-4" />
            </DrawerContent>
          )}
        </Dialog>
      )}

      {!data && loading && <SkeletonRows rows={4} />}
      {!data && !loading && <ErrorNote error={error} onRetry={() => load(filters)} />}
    </div>
  );
}
