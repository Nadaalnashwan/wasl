"use client";

import { LogOut, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DescriptionList } from "@/components/ui/card";
import { Field, Input, Segmented } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { useAuth, useTheme, useToast } from "@/lib/providers";
import { fmtDate } from "@/lib/utils";
import { RowGroup, SettingRow, SettingsSection } from "./shared";

export function ProfileSection() {
  const { t, locale } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? "");
  const [headline, setHeadline] = useState(user?.headline ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = name !== (user?.full_name ?? "") || headline !== (user?.headline ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "PATCH", json: { full_name: name, headline, locale } });
      await refresh();
      toast("ok", t("settings2.profile.saved"));
    } catch (err) {
      toast("error", (err as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection id="profile" title={t("settings2.sec.profile")} description={t("settings2.sec.profile.d")}>
      <form onSubmit={save} className="flex max-w-xl flex-col gap-4">
        <Field label={t("auth.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="name" dir="auto" />
        </Field>
        <Field label={t("settings2.profile.headline")} hint={t("settings2.profile.headline.hint")}>
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={300}
            placeholder={t("settings2.profile.headline.ph")}
            dir="auto"
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={!dirty}>
            <Save />
            {t("common.save")}
          </Button>
          {dirty && !saving && <span className="text-xs text-fg-3">{t("settings2.profile.unsaved")}</span>}
        </div>
      </form>
    </SettingsSection>
  );
}

export function AccountSection() {
  const { t, locale } = useI18n();
  const { user, mode, logout } = useAuth();
  const router = useRouter();
  return (
    <SettingsSection id="account" title={t("settings2.sec.account")} description={t("settings2.sec.account.d")}>
      <RowGroup className="max-w-xl">
        <div className="px-4 py-4">
          <DescriptionList
            items={[
              {
                label: t("auth.email"),
                value: (
                  <>
                    <span className="break-all">{user?.email}</span>
                    <span className="mt-0.5 block text-xs text-fg-3">{t("settings2.account.email.hint")}</span>
                  </>
                ),
              },
              { label: t("settings2.account.method"), value: t(mode === "supabase" ? "settings2.account.method.supabase" : "settings2.account.method.local") },
              { label: t("settings2.account.created"), value: fmtDate(user?.created_at, locale) },
            ]}
          />
        </div>
        <div className="flex justify-end px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut className="rtl:rotate-180" />
            {t("settings2.account.signout")}
          </Button>
        </div>
      </RowGroup>
    </SettingsSection>
  );
}

export function AppearanceSection() {
  const { t, locale, setLocale } = useI18n();
  const { user, refresh } = useAuth();
  const { theme, toggle } = useTheme();
  const toast = useToast();

  async function changeLocale(l: Locale) {
    setLocale(l);
    if (!user || user.locale === l) return;
    try {
      await api("/api/auth/me", { method: "PATCH", json: { locale: l } });
      await refresh();
    } catch (err) {
      toast("error", (err as ApiError).message);
    }
  }

  return (
    <SettingsSection id="appearance" title={t("settings2.sec.appearance")} description={t("settings2.sec.appearance.d")}>
      <RowGroup className="max-w-xl">
        <SettingRow
          labelId="set-lang"
          label={t("set.language")}
          description={t("settings2.appearance.language.hint")}
          control={
            <Segmented
              ariaLabel={t("set.language")}
              value={locale}
              onChange={changeLocale}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
              ]}
            />
          }
        />
        <SettingRow
          label={t("settings2.appearance.theme")}
          control={
            <Segmented
              ariaLabel={t("settings2.appearance.theme")}
              value={theme}
              onChange={(v) => v !== theme && toggle()}
              options={[
                { value: "light", label: t("theme.light") },
                { value: "dark", label: t("theme.dark") },
              ]}
            />
          }
        />
      </RowGroup>
    </SettingsSection>
  );
}
