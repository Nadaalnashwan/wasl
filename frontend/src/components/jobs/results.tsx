"use client";

import { BookmarkCheck, X } from "lucide-react";
import { CompanyMark, JobMeta, ScoreMeter } from "@/components/jobs";
import { Button } from "@/components/ui/button";
import { Segmented, Select } from "@/components/ui/form";
import { useI18n, type TKey } from "@/lib/i18n";
import type { JobItem, JobsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Filters = { city: string; type: string; level: string; remote: "any" | "remote" | "onsite"; sort: "match" | "newest" };
export const NO_FILTERS: Filters = { city: "", type: "", level: "", remote: "any", sort: "match" };

export function isFiltered(f: Filters) {
  return !!(f.city || f.type || f.level || f.remote !== "any");
}

function FilterSelect({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-fg-3">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm">
        {children}
      </Select>
    </div>
  );
}

export function FilterBar({
  filters,
  facets,
  onChange,
  onReset,
}: {
  filters: Filters;
  facets?: JobsResponse["facets"];
  onChange: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <form role="search" aria-label={t("jobs2.filters")} onSubmit={(e) => e.preventDefault()} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap">
      <FilterSelect id="f-city" label={t("jobs.filter.city")} value={filters.city} onChange={(v) => onChange("city", v)}>
        <option value="">{t("jobs.filter.any")}</option>
        {facets?.cities.map((c) => (
          <option key={c.value} value={c.value}>
            {c.value === "Other" ? t("jobs.city.Other") : c.value} ({c.count})
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="f-type" label={t("jobs.filter.type")} value={filters.type} onChange={(v) => onChange("type", v)}>
        <option value="">{t("jobs.filter.any")}</option>
        {facets?.types.map((c) => (
          <option key={c.value} value={c.value}>
            {t(`jobs.type.${c.value}` as TKey)} ({c.count})
          </option>
        ))}
      </FilterSelect>
      <FilterSelect id="f-level" label={t("jobs.filter.level")} value={filters.level} onChange={(v) => onChange("level", v)}>
        <option value="">{t("jobs.filter.any")}</option>
        {facets?.levels.map((c) => (
          <option key={c.value} value={c.value}>
            {t(`jobs.level.${c.value}` as TKey)} ({c.count})
          </option>
        ))}
      </FilterSelect>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
        <span id="f-remote" className="text-xs font-medium text-fg-3">
          {t("jobs.filter.remote")}
        </span>
        <Segmented
          size="sm"
          ariaLabel={t("jobs.filter.remote")}
          value={filters.remote}
          onChange={(v) => onChange("remote", v)}
          options={(["any", "remote", "onsite"] as const).map((v) => ({ value: v, label: t(`jobs.remote.${v}`) }))}
          className="flex-nowrap py-[3px]"
        />
      </div>
      <FilterSelect id="f-sort" label={t("jobs.filter.sort")} value={filters.sort} onChange={(v) => onChange("sort", v as Filters["sort"])}>
        <option value="match">{t("jobs.sort.match")}</option>
        <option value="newest">{t("jobs.sort.newest")}</option>
      </FilterSelect>
      {isFiltered(filters) && (
        <Button variant="ghost" size="sm" onClick={onReset} className="self-end">
          <X />
          {t("jobs.filter.reset")}
        </Button>
      )}
    </form>
  );
}

/** Dense, selectable result rows. */
export function ResultsList({ items, selectedId, onSelect }: { items: JobItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-border" aria-label={t("jobs2.list")}>
      {items.map((job) => {
        const active = job.id === selectedId;
        return (
          <li key={job.id}>
            <button
              type="button"
              onClick={() => onSelect(job.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-surface-2 focus-visible:-outline-offset-2",
                active && "bg-primary-soft/50 hover:bg-primary-soft/50",
              )}
            >
              {active && <span className="absolute inset-y-0 start-0 w-0.5 bg-primary" aria-hidden />}
              <CompanyMark job={job} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug font-medium break-words text-fg" dir="auto">
                  {job.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-2" dir="auto">
                  <span className="truncate">{job.company || "—"}</span>
                  {job.saved && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-primary-text">
                      <BookmarkCheck className="size-3.5" aria-hidden />
                      {t(`track.${job.saved.status}` as TKey)}
                    </span>
                  )}
                </span>
                <JobMeta job={job} className="mt-1" />
              </span>
              <ScoreMeter score={job.match.score} label={t("jobs2.match")} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
