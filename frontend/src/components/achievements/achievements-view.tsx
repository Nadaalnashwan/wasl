"use client";

import { Plus, Search, ShieldCheck, UserCheck, UserPen } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, ErrorNote, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import { AchievementDrawer } from "./achievement-drawer";
import { AchievementRow } from "./achievement-row";
import { AddAchievementDialog, type AddMethod } from "./add-dialog";
import { CATEGORIES, fmt, matchesQuery, SOURCES, type AchStatus, type Category, type Source } from "./shared";

const TABS: AchStatus[] = ["pending", "confirmed", "rejected"];

function Legend() {
  const { t } = useI18n();
  const items = [
    { icon: ShieldCheck, tone: "text-ok", label: t("achievements2.evidence.verified"), d: t("achievements2.legend.verified") },
    { icon: UserCheck, tone: "text-ok", label: t("achievements2.state.confirmed"), d: t("achievements2.legend.confirmed") },
    { icon: UserPen, tone: "text-warn", label: t("achievements2.state.pending"), d: t("achievements2.legend.pending") },
  ];
  return (
    <dl className="ink-soft mb-8 grid gap-x-8 gap-y-3 bg-primary-soft/50 p-4 text-sm sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="flex items-center gap-2.5 font-medium text-fg">
            <it.icon className={`size-4 shrink-0 ${it.tone}`} aria-hidden />
            {it.label}
          </dt>
          <dd className="ps-[26px] text-xs leading-relaxed text-fg-3">{it.d}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AchievementsView({ initialStatus, initialOpen }: { initialStatus?: AchStatus; initialOpen?: string }) {
  const { t } = useI18n();
  const { data, error, loading, reload, setData } = useApi<Achievement[]>("/api/achievements");
  const [tab, setTab] = useState<AchStatus | null>(initialStatus ?? null);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [source, setSource] = useState<Source | "">("");
  const [addOpen, setAddOpen] = useState(false);
  const [addMethod, setAddMethod] = useState<AddMethod>("manual");

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<AchStatus, number> = { pending: 0, confirmed: 0, rejected: 0 };
    for (const a of all) c[a.status] += 1;
    return c;
  }, [all]);
  const selected = openId ? all.find((a) => a.id === openId) ?? null : null;
  // Until the user picks a tab: the opened item's tab, else pending work first.
  const active: AchStatus = tab ?? selected?.status ?? (counts.pending > 0 ? "pending" : "confirmed");
  const filtersOn = !!(q.trim() || category || source);

  const visible = useMemo(
    () =>
      all.filter(
        (a) => a.status === active && (!category || a.category === category) && (!source || a.source === source) && matchesQuery(a, q.trim()),
      ),
    [all, active, category, source, q],
  );
  const inTab = counts[active];

  function startAdd(m: AddMethod) {
    setAddMethod(m);
    setAddOpen(true);
  }

  function replace(next: Achievement) {
    setData((list) => (list ? list.map((x) => (x.id === next.id ? { ...x, ...next } : x)) : list));
  }

  return (
    <div>
      <PageHeader
        title={t("achievements2.title")}
        sub={t("achievements2.sub")}
        actions={
          <Button onClick={() => startAdd("manual")}>
            <Plus /> {t("achievements2.add")}
          </Button>
        }
      />

      <Legend />

      <AddAchievementDialog open={addOpen} onOpenChange={setAddOpen} initialMethod={addMethod} onDone={reload} />

      <ErrorNote error={error} onRetry={reload} className="mb-6" />

      <Tabs value={active} onValueChange={(v) => setTab(v as AchStatus)}>
        <TabsList aria-label={t("achievements2.tabs.label")} className="mb-4">
          {TABS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`achievements2.tab.${s}`)}
              <span className="num rounded-full bg-surface-2 px-2 text-xs font-bold text-fg">{data ? counts[s] : "–"}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-[1_1_16rem]">
            <span className="sr-only">{t("achievements2.filter.search")}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("achievements2.filter.search.ph")} className="ps-9" />
          </label>
          <label className="min-w-0 flex-[0_1_12rem]">
            <span className="sr-only">{t("achievements2.filter.category")}</span>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
              <option value="">{t("achievements2.filter.all_categories")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`ach.cat.${c}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="min-w-0 flex-[0_1_12rem]">
            <span className="sr-only">{t("achievements2.filter.source")}</span>
            <Select value={source} onChange={(e) => setSource(e.target.value as Source | "")}>
              <option value="">{t("achievements2.filter.all_sources")}</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`achievements2.source.${s}`)}
                </option>
              ))}
            </Select>
          </label>
          {filtersOn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setCategory("");
                setSource("");
              }}
            >
              {t("achievements2.filter.clear")}
            </Button>
          )}
        </div>

        {TABS.map((s) => (
          <TabsContent key={s} value={s}>
            {loading && !data ? (
              <SkeletonRows rows={4} />
            ) : !data ? null : inTab === 0 ? (
              <EmptyState
                title={t(`achievements2.empty.${s}`)}
                text={t(`achievements2.empty.${s}.d`)}
                action={
                  s !== "rejected" && (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startAdd(s === "pending" ? "document" : "manual")}>
                        <Plus /> {t(s === "pending" ? "achievements2.add.tab.document" : "achievements2.add")}
                      </Button>
                      {s === "pending" && (
                        <Button size="sm" variant="ghost" onClick={() => startAdd("github")}>
                          {t("achievements2.add.tab.github")}
                        </Button>
                      )}
                    </div>
                  )
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState icon={<Search />} title={t("achievements2.empty.filtered")} text={t("achievements2.empty.filtered.d")} />
            ) : (
              <>
                <p className="mb-2 text-xs text-fg-3" aria-live="polite">
                  {fmt(t("achievements2.filter.showing"), { n: visible.length, t: inTab })}
                </p>
                <ul className="ink-card divide-y divide-border-soft overflow-hidden" aria-label={t("achievements2.list.label")}>
                  {visible.map((a) => (
                    <AchievementRow key={a.id} a={a} active={a.id === openId} onOpen={(x) => {
                        setTab(active);
                        setOpenId(x.id);
                      }} />
                  ))}
                </ul>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {selected && (
        <AchievementDrawer
          key={selected.id}
          a={selected}
          open
          onOpenChange={(o) => {
            if (!o) {
              setTab(active);
              setOpenId(null);
            }
          }}
          onChanged={replace}
          onDeleted={(id) => {
            setOpenId(null);
            setData((list) => (list ? list.filter((x) => x.id !== id) : list));
          }}
        />
      )}
    </div>
  );
}
