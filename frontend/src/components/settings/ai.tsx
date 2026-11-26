"use client";

import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { ErrorNote, Notice, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Status } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { ConfirmDialog, Switch } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import { cn, fmtDate } from "@/lib/utils";
import { fill, providerName, RowGroup, type AiKey, type AiMode, type AiSettings, SettingsSection } from "./shared";

const MODES: AiMode[] = ["platform", "personal_first", "personal"];

type Props = {
  data: AiSettings | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (d: AiSettings) => void;
};

/* ------------------------------------------------------------------ AI mode preferences */
export function AiProvidersSection({ data, error, loading, reload, setData }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const fallbackId = useId();
  const crossId = useId();

  async function save(patch: Partial<Pick<AiSettings, "ai_mode" | "allow_platform_fallback" | "allow_cross_provider">>) {
    if (!data) return;
    const body = {
      ai_mode: data.ai_mode,
      allow_platform_fallback: data.allow_platform_fallback,
      allow_cross_provider: data.allow_cross_provider,
      ...patch,
    };
    const previous = data;
    setData({ ...data, ...body }); // optimistic
    setSaving(true);
    try {
      setData(await api<AiSettings>("/api/settings/ai", { method: "PUT", json: body }));
      toast("ok", t("settings2.ai.saved"));
    } catch (e) {
      setData(previous);
      toast("error", (e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  const personal = data && data.ai_mode !== "platform";
  const hasValidKey = !!data?.keys.some((k) => k.status === "valid");

  return (
    <SettingsSection id="ai" title={t("settings2.sec.ai")} description={t("settings2.sec.ai.d")}>
      {error && !data ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonRows rows={2} />
      ) : data ? (
        <div className="flex flex-col gap-5">
          <fieldset disabled={saving} aria-busy={saving}>
            <legend className="mb-2 text-sm font-medium text-fg">{t("settings2.ai.mode")}</legend>
            <div className="divide-y divide-border ink-soft">
              {MODES.map((m) => {
                const checked = data.ai_mode === m;
                return (
                  <label
                    key={m}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-surface-2",
                      checked && "bg-primary-soft/60 hover:bg-primary-soft/60",
                    )}
                  >
                    <input
                      type="radio"
                      name="ai_mode"
                      value={m}
                      checked={checked}
                      onChange={() => save({ ai_mode: m })}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{t(`settings2.ai.mode.${m}` as TKey)}</span>
                      <span className="mt-0.5 block text-sm text-fg-3">{t(`settings2.ai.mode.${m}.d` as TKey)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <RowGroup>
            <div className="flex items-start gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <label htmlFor={fallbackId} className={cn("text-sm font-medium", personal ? "text-fg" : "text-fg-3")}>
                  {t("settings2.ai.fallback")}
                </label>
                <p className="mt-0.5 text-sm text-fg-3">{personal ? t("settings2.ai.fallback.d") : t("settings2.ai.fallback.na")}</p>
              </div>
              <Switch
                id={fallbackId}
                checked={data.allow_platform_fallback}
                disabled={!personal || saving}
                onCheckedChange={(v) => save({ allow_platform_fallback: v })}
              />
            </div>
            <div className="flex items-start gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <label htmlFor={crossId} className="text-sm font-medium text-fg">
                  {t("settings2.ai.cross")}
                </label>
                <p className="mt-0.5 text-sm text-fg-3">{t("settings2.ai.cross.d")}</p>
              </div>
              <Switch id={crossId} checked={data.allow_cross_provider} disabled={saving} onCheckedChange={(v) => save({ allow_cross_provider: v })} />
            </div>
          </RowGroup>

          {personal && !hasValidKey && !data.allow_platform_fallback && (
            <Notice tone="warn" title={t("settings2.ai.nokey")} />
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-fg">{t("settings2.ai.platform")}</h3>
            {data.platform_providers.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {data.platform_providers.map((p) => (
                  <li key={p}>
                    <Badge tone="outline">{providerName(p)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-3">{t("settings2.ai.platform.none")}</p>
            )}
          </div>
        </div>
      ) : null}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ BYOK keys */
function KeyRow({ provider, row, onSaved, onRemoved }: { provider: string; row?: AiKey; onSaved: (k: AiKey) => void; onRemoved: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "validate" | "remove" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const name = providerName(provider);

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().length < 10) return;
    setBusy("save");
    setFormError(null);
    try {
      const k = await api<AiKey>(`/api/settings/keys/${provider}`, { method: "PUT", json: { api_key: value.trim() } });
      onSaved(k);
      setValue("");
      setEditing(false);
      toast("ok", fill(t("settings2.keys.saved"), { p: name }));
    } catch (err) {
      setFormError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function revalidate() {
    setBusy("validate");
    try {
      const k = await api<AiKey>(`/api/settings/keys/${provider}/validate`, { method: "POST" });
      onSaved(k);
      toast(k.status === "valid" ? "ok" : "error", fill(t(k.status === "valid" ? "settings2.keys.ok" : "settings2.keys.bad"), { p: name }));
    } catch (err) {
      toast("error", (err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      await api(`/api/settings/keys/${provider}`, { method: "DELETE" });
      onRemoved();
      setConfirm(false);
      toast("ok", fill(t("settings2.keys.removed"), { p: name }));
    } catch (err) {
      toast("error", (err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-fg">{name}</h3>
            {row ? (
              <Status tone={row.status === "valid" ? "ok" : "bad"}>{t(row.status === "valid" ? "settings2.keys.valid" : "settings2.keys.invalid")}</Status>
            ) : (
              <Status tone="outline">{t("settings2.keys.none")}</Status>
            )}
          </div>
          {row && (
            <p className="mt-0.5 text-xs text-fg-3">
              <span className="font-mono" dir="ltr">
                {fill(t("settings2.keys.ending"), { h: row.hint })}
              </span>
              {row.validated_at && <> · {fill(t("settings2.keys.checked"), { d: fmtDate(row.validated_at, locale) })}</>}
            </p>
          )}
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            {row && (
              <>
                <Button size="sm" variant="ghost" onClick={revalidate} loading={busy === "validate"} disabled={busy !== null}>
                  {busy !== "validate" && <RefreshCw />}
                  {t("settings2.keys.validate")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={busy !== null} aria-label={`${t("settings2.keys.remove")} — ${name}`}>
                  <Trash2 />
                  <span className="sm:sr-only">{t("settings2.keys.remove")}</span>
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy !== null}>
              <KeyRound />
              {row ? t("settings2.keys.replace") : t("settings2.keys.add")}
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={saveKey} className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {fill(t("settings2.keys.input"), { p: name })}
          </label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            minLength={10}
            maxLength={300}
            aria-invalid={!!formError || undefined}
            aria-describedby={`${inputId}-hint`}
            autoFocus
          />
          <p id={`${inputId}-hint`} className="text-xs text-fg-3">
            {t("settings2.keys.input.hint")}
          </p>
          {formError && (
            <p className="text-xs text-bad" role="alert">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setValue("");
                setFormError(null);
              }}
              disabled={busy === "save"}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" type="submit" loading={busy === "save"} disabled={value.trim().length < 10}>
              {t("settings2.keys.save")}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={fill(t("settings2.keys.remove.title"), { p: name })}
        description={t("settings2.keys.remove.d")}
        confirmLabel={t("settings2.keys.remove")}
        cancelLabel={t("common.cancel")}
        onConfirm={remove}
        loading={busy === "remove"}
        destructive
      />
    </li>
  );
}

export function ApiKeysSection({ data, error, loading, reload, setData }: Props) {
  const { t } = useI18n();
  return (
    <SettingsSection id="keys" title={t("settings2.sec.keys")} description={t("settings2.sec.keys.d")}>
      {error && !data ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading && !data ? (
        <SkeletonRows rows={3} />
      ) : data ? (
        <ul className="divide-y divide-border ink-soft">
          {data.byok_providers.map((p) => (
            <KeyRow
              key={p}
              provider={p}
              row={data.keys.find((k) => k.provider === p)}
              onSaved={(k) => setData({ ...data, keys: [...data.keys.filter((x) => x.provider !== p), k] })}
              onRemoved={() => setData({ ...data, keys: data.keys.filter((x) => x.provider !== p) })}
            />
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
