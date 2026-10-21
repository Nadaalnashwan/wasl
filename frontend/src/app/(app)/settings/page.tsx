
"use client";

import {
  Link2,
  Save,
  Unplug,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LinkedinIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Input, Segmented } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useAuth, useToast } from "@/lib/providers";
import type { IntegrationStatus } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

function Connection({
  id,
  name,
  icon,
  status,
  onChange,
}: {
  id: "linkedin";
  name: string;
  icon: React.ReactNode;
  status?: IntegrationStatus;
  onChange: () => void;
}) {
  const { locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);

    try {
      const { url } = await api<{ url: string }>(
        `/api/integrations/${id}/authorize`
      );

      window.location.href = url;
    } catch (e) {
      toast("error", (e as ApiError).message);
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);

    try {
      await api(`/api/integrations/${id}`, {
        method: "DELETE",
      });

      onChange();
    } finally {
      setBusy(false);
    }
  }

  const state = !status
    ? "…"
    : !status.configured_on_server
      ? "unavailable"
      : status.connected
        ? "connected"
        : status.status === "expired"
          ? "expired"
          : "disconnected";

  const tone =
    state === "connected"
      ? "ok"
      : state === "unavailable"
        ? "neutral"
        : state === "expired"
          ? "bad"
          : "warn";

  return (
    <div className="sketch-soft flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border-2 border-ink bg-sky [&_svg]:size-5">
          {icon}
        </span>

        <div className="flex-1">
          <div className="font-hand text-xl">
            {name}
          </div>

          {status?.account_name && (
            <div className="text-xs text-ink-soft">
              {status.account_name}
            </div>
          )}
        </div>

        <Badge tone={tone}>
          {state}
        </Badge>
      </div>

      {state === "unavailable" && (
        <p className="text-xs text-ink-soft">
          {locale === "ar"
            ? "لم تُضبط بيانات تطبيق OAuth على الخادم. راجع docs/SETUP.md لإعدادها."
            : "OAuth app credentials are not configured on the server. See docs/SETUP.md to enable this integration."}
        </p>
      )}

      {status?.connected && (
        <p className="text-xs text-ink-faint">
          scopes: {status.scopes || "—"}{" "}
          {status.expires_at && (
            <>
              · expires{" "}
              {fmtDate(status.expires_at, locale)}
            </>
          )}
        </p>
      )}

      {status?.configured_on_server && (
        <div className="flex gap-2">
          {status.connected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={disconnect}
              loading={busy}
            >
              <Unplug />
              {locale === "ar"
                ? "فصل"
                : "Disconnect"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={connect}
              loading={busy}
            >
              <Link2 />
              {locale === "ar"
                ? "ربط"
                : "Connect"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();

  const integrations =
    useApi<Record<string, IntegrationStatus>>(
      "/api/integrations"
    );

  const [name, setName] = useState(
    user?.full_name ?? ""
  );

  const [headline, setHeadline] = useState(
    user?.headline ?? ""
  );

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(
      window.location.search
    );

    const which = p.get("integration");
    const result = p.get("result");

    if (which && result) {
      toast(
        result === "connected" ? "ok" : "error",
        `${which}: ${result.replace("_", " ")}`
      );

      window.history.replaceState(
        null,
        "",
        "/settings"
      );
    }
  }, [toast]);

  async function saveProfile() {
    setSaving(true);

    try {
      await api("/api/auth/me", {
        method: "PATCH",
        json: {
          full_name: name,
          headline,
          locale,
        },
      });

      await refresh();

      toast(
        "ok",
        locale === "ar"
          ? "تم الحفظ"
          : "Saved"
      );
    } catch (e) {
      toast(
        "error",
        (e as ApiError).message
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("set.title")} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardTitle icon={<UserRound />}>
            {t("set.profile")}
          </CardTitle>

          <div className="flex flex-col gap-4">
            <Field label={t("auth.name")}>
              <Input
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                maxLength={200}
              />
            </Field>

            <Field label="Headline">
              <Input
                value={headline}
                onChange={(e) =>
                  setHeadline(e.target.value)
                }
                maxLength={300}
                placeholder="AI Engineer · Riyadh"
              />
            </Field>

            <Field label={t("auth.email")}>
              <Input
                value={user?.email ?? ""}
                disabled
              />
            </Field>

            <Field
              group
              label={t("set.language")}
            >
              <Segmented
                ariaLabel={t("set.language")}
                value={locale}
                onChange={setLocale}
                options={[
                  {
                    value: "en",
                    label: "English",
                  },
                  {
                    value: "ar",
                    label: "العربية",
                  },
                ]}
              />
            </Field>

            <Button
              onClick={saveProfile}
              loading={saving}
              className="self-start"
            >
              <Save />
              {t("common.save")}
            </Button>
          </div>
        </Card>

        {/* LinkedIn Connection Only */}
        <Card>
          <CardTitle icon={<Link2 />}>
            {t("set.connections")}
          </CardTitle>

          <div className="flex flex-col gap-3">
            <Connection
              id="linkedin"
              name="LinkedIn"
              icon={<LinkedinIcon />}
              status={integrations.data?.linkedin}
              onChange={integrations.reload}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
