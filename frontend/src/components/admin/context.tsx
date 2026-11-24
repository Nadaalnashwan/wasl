"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/providers";
import type { Days, Filters, Health, Metrics } from "./types";

/* ------------------------------------------------------------------ access gate
 * The proxy (server) already verified the admin cookie. The console re-checks with the user's bearer token and
 * renders NOTHING from the API until /api/admin/whoami succeeds. Any later 401/403 from an admin endpoint (e.g. the
 * role was revoked mid-session) flips the whole console to the denied screen — no partial data stays on screen. */

export type Access = "checking" | "admin" | "denied" | "error";

type Ctx = { access: Access; deny: () => void; recheck: () => void };
const AdminContext = createContext<Ctx | null>(null);

export function AdminAccessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<Access>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        await api<{ id: string; role: string }>("/api/admin/whoami");
        if (!cancelled) setAccess("admin");
      } catch (e) {
        if (cancelled) return;
        const status = e instanceof ApiError ? e.status : 0;
        // 401 clears the session in lib/api → the redirect above takes over
        setAccess(status === 403 ? "denied" : status === 401 ? "checking" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, attempt]);

  const deny = useCallback(() => setAccess("denied"), []);
  const recheck = useCallback(() => {
    setAccess("checking");
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(() => ({ access, deny, recheck }), [access, deny, recheck]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminAccess() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminAccess outside AdminAccessProvider");
  return ctx;
}

/** Turns an admin-API error into the right console state. Returns true when the error was an access failure. */
export function adminFetchGuard(error: unknown, deny: () => void): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 403) {
    deny();
    return true;
  }
  // 401: lib/api clears the expired session and the shell redirects to /login — nothing to render meanwhile
  return error.status === 401;
}

/* ------------------------------------------------------------------ data */

export type Query<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  fetchedAt: Date | null;
  reload: () => Promise<void>;
};

/** GET an admin endpoint. Keeps the previous result visible (dimmed) while a new filter loads; drops it on error. */
export function useAdminQuery<T>(path: string | null): Query<T> {
  const { deny, access } = useAdminAccess();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const seq = useRef(0);
  const enabled = access === "admin" && !!path;

  const reload = useCallback(async () => {
    if (!enabled || !path) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await api<T>(path);
      if (id !== seq.current) return;
      setData(res);
      setError(null);
      setFetchedAt(new Date());
    } catch (e) {
      if (id !== seq.current) return;
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      setData(null);
      setError(err);
      adminFetchGuard(err, deny);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [enabled, path, deny]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount / path change
    reload();
  }, [reload]);

  return { data, error, loading, fetchedAt, reload };
}

/* ------------------------------------------------------------------ filters (kept in the URL so views are shareable) */

const DAY_VALUES: Days[] = [1, 7, 30, 90];

export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: Filters = useMemo(() => {
    const d = Number(params.get("days"));
    return {
      days: (DAY_VALUES as number[]).includes(d) ? (d as Days) : 7,
      provider: params.get("provider") || null,
      model: params.get("model") || null,
      task: params.get("task") || null,
    };
  }, [params]);

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "" || (k === "days" && v === 7)) next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );

  return { filters, setFilters, search: params.toString() };
}

export function metricsPath(f: Filters, use: { provider?: boolean; model?: boolean; task?: boolean } = { provider: true, model: true, task: true }) {
  const q = new URLSearchParams({ days: String(f.days) });
  if (use.provider && f.provider) q.set("provider", f.provider);
  if (use.model && f.model) q.set("model", f.model);
  if (use.task && f.task) q.set("task", f.task);
  return `/api/admin/monitoring/metrics?${q.toString()}`;
}

export function useMetrics(use?: { provider?: boolean; model?: boolean; task?: boolean }) {
  const { filters } = useFilters();
  return useAdminQuery<Metrics>(metricsPath(filters, use));
}

export function useHealth() {
  return useAdminQuery<Health>("/api/admin/health");
}
