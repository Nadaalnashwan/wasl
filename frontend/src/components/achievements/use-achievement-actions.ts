"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Achievement } from "@/lib/types";
import type { CVUpdate } from "./shared";

export type AchievementPatch = Partial<
  Pick<Achievement, "title" | "description" | "category" | "technologies" | "skills" | "impact" | "occurred_on" | "contribution_note">
>;

/** All per-achievement API calls, with pending state, inline CV-update result and toasts. */
export function useAchievementActions(onChanged?: (a: Achievement | null) => void, { toastErrors = true }: { toastErrors?: boolean } = {}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "confirm" | "reject" | "delete" | "suggest" | "save">(null);
  const [cvResult, setCvResult] = useState<CVUpdate | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function run<R>(kind: NonNullable<typeof busy>, fn: () => Promise<R>): Promise<R | undefined> {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      setError(err);
      if (toastErrors) toast("error", err.message);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const confirm = (a: Achievement, note: string) =>
    run("confirm", async () => {
      const res = await api<{ achievement: Achievement; cv_update: CVUpdate | null }>(`/api/achievements/${a.id}/confirm`, {
        method: "POST",
        json: { contribution_note: note, auto_cv_update: true },
      });
      toast("ok", t("achievements2.confirmed_toast"));
      setCvResult(res.cv_update);
      onChanged?.(res.achievement);
      return res;
    });

  const reject = (a: Achievement) =>
    run("reject", async () => {
      const res = await api<Achievement>(`/api/achievements/${a.id}/reject`, { method: "POST" });
      toast("info", t("achievements2.rejected_toast"));
      onChanged?.(res);
      return res;
    });

  const remove = (a: Achievement) =>
    run("delete", async () => {
      await api(`/api/achievements/${a.id}`, { method: "DELETE" });
      toast("ok", t("achievements2.deleted_toast"));
      onChanged?.(null);
      return true;
    });

  const suggest = (a: Achievement) =>
    run("suggest", async () => {
      const res = await api<CVUpdate>(`/api/achievements/${a.id}/suggest-cv-update`, { method: "POST" });
      setCvResult(res);
      return res;
    });

  const save = (a: Achievement, patch: AchievementPatch) =>
    run("save", async () => {
      const res = await api<Achievement>(`/api/achievements/${a.id}`, { method: "PATCH", json: patch });
      toast("ok", t("achievements2.edit.saved"));
      onChanged?.(res);
      return res;
    });

  return { busy, error, cvResult, setCvResult, confirm, reject, remove, suggest, save };
}
