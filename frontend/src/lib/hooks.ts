"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** GET a resource with loading / error / reload. `path=null` skips the request. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await api<T>(path);
      if (id === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount / path change
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Wrap an async action with pending state + error toast. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(async <R,>(key: string, fn: () => Promise<R>, onError?: (e: ApiError) => void): Promise<R | undefined> => {
    setPending(key);
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      onError?.(err);
      return undefined;
    } finally {
      setPending(null);
    }
  }, []);
  return { pending, run };
}

export function splitList(s: string) {
  return s
    .split(/[,،\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
