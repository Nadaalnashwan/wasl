"use client";

import { Link2, Unplug } from "lucide-react";
import { useState } from "react";
import { GithubIcon, LinkedinIcon } from "@/components/brand-icons";
import { ErrorNote } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Status, type BadgeTone } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { IntegrationStatus } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { fill, RowGroup, SettingsSection } from "./shared";

type Provider = "linkedin" | "github";
type State = "loading" | "unavailable" | "connected" | "expired" | "disconnected";

const META: Record<Provider, { name: string; icon: React.ReactNode; desc: TKey }> = {
  linkedin: { name: "LinkedIn", icon: <LinkedinIcon className="size-5" />, desc: "settings2.int.linkedin.d" },
  github: { name: "GitHub", icon: <GithubIcon className="size-5" />, desc: "settings2.int.github.d" },
};

const TONE: Record<State, BadgeTone> = { loading: "neutral", unavailable: "neutral", connected: "ok", expired: "bad", disconnected: "outline" };

function stateOf(s?: IntegrationStatus): State {
  if (!s) return "loading";
  if (!s.configured_on_server) return "unavailable";
  if (s.connected) return "connected";
  if (s.status === "expired") return "expired";
  return "disconnected";
}

function Connection({ id, status, onChange }: { id: Provider; status?: IntegrationStatus; onChange: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const meta = META[id];
  const state = stateOf(status);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(`/api/integrations/${id}/authorize`);
      window.location.href = url;
    } catch (e) {
      toast("error", (e as ApiError).message);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api(`/api/integrations/${id}`, { method: "DELETE" });
      toast("ok", fill(t("settings2.int.disconnected"), { p: meta.name }));
      setConfirm(false);
      onChange();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-2 text-fg-2" aria-hidden>
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold text-fg">{meta.name}</h3>
          <Status tone={TONE[state]}>{t(`settings2.int.state.${state}` as TKey)}</Status>
        </div>
        <p className="mt-0.5 text-sm text-fg-3">{t(meta.desc)}</p>
        {state === "unavailable" && <p className="mt-2 text-xs text-fg-3">{t("settings2.int.unavailable.d")}</p>}
        {state === "expired" && <p className="mt-2 text-xs text-bad">{t("settings2.int.expired.d")}</p>}
        {status?.connected && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
            {status.account_name && (
              <>
                <dt className="text-fg-3">{t("settings2.int.account")}</dt>
                <dd className="min-w-0 break-words text-fg-2" dir="auto">
                  {status.account_name}
                </dd>
              </>
            )}
            {status.connected_at && (
              <>
                <dt className="text-fg-3">{t("settings2.int.since")}</dt>
                <dd className="text-fg-2">{fmtDate(status.connected_at, locale)}</dd>
              </>
            )}
            {status.expires_at && (
              <>
                <dt className="text-fg-3">{t("settings2.int.expires")}</dt>
                <dd className="text-fg-2">{fmtDate(status.expires_at, locale)}</dd>
              </>
            )}
            <dt className="text-fg-3">{t("settings2.int.scopes")}</dt>
            <dd className="min-w-0 break-words font-mono text-[11px] text-fg-2">{status.scopes || "—"}</dd>
          </dl>
        )}
      </div>
      {status?.configured_on_server && (
        <div className="shrink-0">
          {status.connected ? (
            <Button size="sm" variant="secondary" onClick={() => setConfirm(true)} disabled={busy}>
              <Unplug />
              {t("settings2.int.disconnect")}
            </Button>
          ) : (
            <Button size="sm" variant={state === "expired" ? "primary" : "secondary"} onClick={connect} loading={busy}>
              <Link2 />
              {t(state === "expired" ? "settings2.int.reconnect" : "settings2.int.connect")}
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={fill(t("settings2.int.disconnect.title"), { p: meta.name })}
        description={t("settings2.int.disconnect.d")}
        confirmLabel={t("settings2.int.disconnect")}
        cancelLabel={t("common.cancel")}
        onConfirm={disconnect}
        loading={busy}
        destructive
      />
    </li>
  );
}

export function IntegrationsSection({
  data,
  error,
  reload,
}: {
  data: Record<string, IntegrationStatus> | null;
  error: ApiError | null;
  reload: () => void;
}) {
  const { t } = useI18n();
  return (
    <SettingsSection id="integrations" title={t("settings2.sec.integrations")} description={t("settings2.sec.integrations.d")}>
      {error && !data ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : (
        <RowGroup>
          <ul className="divide-y divide-border">
            {(["linkedin", "github"] as const).map((p) => (
              <Connection key={p} id={p} status={data?.[p]} onChange={reload} />
            ))}
          </ul>
        </RowGroup>
      )}
    </SettingsSection>
  );
}

/** Maps the OAuth callback redirect (?integration=..&result=..) to a localized toast message. */
export function callbackMessage(t: (k: TKey) => string, provider: string, result: string) {
  const name = META[provider as Provider]?.name ?? provider;
  const known = ["connected", "denied", "invalid_state", "expired_state", "error"];
  const key = (known.includes(result) ? `settings2.int.result.${result}` : "settings2.int.result.error") as TKey;
  return { ok: result === "connected", text: fill(t(key), { p: name }) };
}
