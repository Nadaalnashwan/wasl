"use client";

import { Cpu, KeyRound, Link2, Lock, RefreshCw, Save, ShieldCheck, Trash2, Unplug, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { GithubIcon, LinkedinIcon } from "@/components/brand-icons";
import { Loading } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Input, Segmented } from "@/components/ui/form";
import { Switch } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useAuth, useToast } from "@/lib/providers";
import type { IntegrationStatus } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type AiSettings = {
  ai_mode: "platform" | "personal" | "personal_first";
  allow_platform_fallback: boolean;
  allow_cross_provider: boolean;
  platform_providers: string[];
  byok_providers: string[];
  keys: { provider: string; hint: string; status: string; validated_at: string | null }[];
};

const PROVIDER_LINKS: Record<string, string> = {
  groq: "https://console.groq.com/keys",
  gemini: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
};

function Connection({ id, name, icon, status, onChange }: { id: "linkedin" | "github"; name: string; icon: React.ReactNode; status?: IntegrationStatus; onChange: () => void }) {
  const { locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
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
      onChange();
    } finally {
      setBusy(false);
    }
  }
  const state = !status ? "…" : !status.configured_on_server ? "unavailable" : status.connected ? "connected" : status.status === "expired" ? "expired" : "disconnected";
  const tone = state === "connected" ? "ok" : state === "unavailable" ? "neutral" : state === "expired" ? "bad" : "warn";
  return (
    <div className="sketch-soft flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl border-2 border-ink bg-sky [&_svg]:size-5">{icon}</span>
        <div className="flex-1">
          <div className="font-hand text-xl">{name}</div>
          {status?.account_name && <div className="text-xs text-ink-soft">{status.account_name}</div>}
        </div>
        <Badge tone={tone}>{state}</Badge>
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
          scopes: {status.scopes || "—"} {status.expires_at && <>· expires {fmtDate(status.expires_at, locale)}</>}
        </p>
      )}
      {status?.configured_on_server && (
        <div className="flex gap-2">
          {status.connected ? (
            <Button size="sm" variant="outline" onClick={disconnect} loading={busy}>
              <Unplug /> {locale === "ar" ? "فصل" : "Disconnect"}
            </Button>
          ) : (
            <Button size="sm" onClick={connect} loading={busy}>
              <Link2 /> {locale === "ar" ? "ربط" : "Connect"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function KeyRow({ provider, saved, onChange }: { provider: string; saved?: AiSettings["keys"][number]; onChange: () => void }) {
  const { locale } = useI18n();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function run(kind: "save" | "validate" | "delete") {
    setBusy(kind);
    try {
      if (kind === "save") await api(`/api/settings/keys/${provider}`, { method: "PUT", json: { api_key: value } });
      if (kind === "validate") await api(`/api/settings/keys/${provider}/validate`, { method: "POST" });
      if (kind === "delete") await api(`/api/settings/keys/${provider}`, { method: "DELETE" });
      setValue("");
      toast("ok", kind === "delete" ? (locale === "ar" ? "حُذف المفتاح" : "Key deleted") : locale === "ar" ? "تم التحقق من المفتاح وتشفيره" : "Key validated and stored encrypted");
      onChange();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="sketch-soft flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-hand text-xl capitalize">{provider}</b>
        {saved ? (
          <>
            <Badge tone={saved.status === "valid" ? "ok" : "bad"}>{saved.status}</Badge>
            <code className="text-xs text-ink-soft">{saved.hint}</code>
          </>
        ) : (
          <Badge>{locale === "ar" ? "لا يوجد مفتاح" : "no key"}</Badge>
        )}
        <a className="ms-auto text-xs underline" href={PROVIDER_LINKS[provider]} target="_blank" rel="noreferrer">
          {locale === "ar" ? "احصل على مفتاح" : "get a key"}
        </a>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run("save");
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={saved ? (locale === "ar" ? "استبدال المفتاح…" : "Replace key…") : locale === "ar" ? "الصق مفتاحك" : "Paste your API key"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1"
          aria-label={`${provider} API key`}
        />
        <Button size="sm" type="submit" loading={busy === "save"} disabled={value.trim().length < 10}>
          <Save />
        </Button>
        {saved && (
          <>
            <Button size="sm" type="button" variant="outline" onClick={() => run("validate")} loading={busy === "validate"} aria-label="Re-validate">
              <RefreshCw />
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => run("delete")} loading={busy === "delete"} aria-label="Delete key">
              <Trash2 />
            </Button>
          </>
        )}
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const integrations = useApi<Record<string, IntegrationStatus>>("/api/integrations");
  const ai = useApi<AiSettings>("/api/settings/ai");
  const [name, setName] = useState(user?.full_name ?? "");
  const [headline, setHeadline] = useState(user?.headline ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const which = p.get("integration");
    const result = p.get("result");
    if (which && result) {
      toast(result === "connected" ? "ok" : "error", `${which}: ${result.replace("_", " ")}`);
      window.history.replaceState(null, "", "/settings");
    }
  }, [toast]);

  async function saveProfile() {
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "PATCH", json: { full_name: name, headline, locale } });
      await refresh();
      toast("ok", locale === "ar" ? "تم الحفظ" : "Saved");
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setSaving(false);
    }
  }

  async function savePrefs(patch: Partial<AiSettings>) {
    if (!ai.data) return;
    const next = { ...ai.data, ...patch };
    ai.setData(next);
    try {
      await api("/api/settings/ai", {
        method: "PUT",
        json: { ai_mode: next.ai_mode, allow_platform_fallback: next.allow_platform_fallback, allow_cross_provider: next.allow_cross_provider },
      });
    } catch (e) {
      toast("error", (e as ApiError).message);
      ai.reload();
    }
  }

  const modeLabels =
    locale === "ar"
      ? { platform: "ذكاء وصل", personal: "مفاتيحي فقط", personal_first: "مفاتيحي أولاً" }
      : { platform: "Wasl AI", personal: "My keys only", personal_first: "My keys first" };

  return (
    <div>
      <PageHeader title={t("set.title")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<UserRound />}>{t("set.profile")}</CardTitle>
          <div className="flex flex-col gap-4">
            <Field label={t("auth.name")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Headline">
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={300} placeholder="AI Engineer · Riyadh" />
            </Field>
            <Field label={t("auth.email")}>
              <Input value={user?.email ?? ""} disabled />
            </Field>
            <Field group label={t("set.language")}>
              <Segmented ariaLabel={t("set.language")} value={locale} onChange={setLocale} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} />
            </Field>
            <Button onClick={saveProfile} loading={saving} className="self-start">
              <Save /> {t("common.save")}
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle icon={<Link2 />}>{t("set.connections")}</CardTitle>
          <div className="flex flex-col gap-3">
            <Connection id="linkedin" name="LinkedIn" icon={<LinkedinIcon />} status={integrations.data?.linkedin} onChange={integrations.reload} />
            <Connection id="github" name="GitHub" icon={<GithubIcon />} status={integrations.data?.github} onChange={integrations.reload} />
            <p className="flex items-start gap-2 text-xs text-ink-faint">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              {locale === "ar"
                ? "تُحفظ رموز الوصول مشفرة على الخادم ولا تصل إلى المتصفح. لا ننشر شيئاً دون تأكيدك الصريح."
                : "Access tokens are stored encrypted on the server and never reach the browser. Nothing is published without your explicit confirmation."}
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle icon={<Cpu />}>{t("set.ai")}</CardTitle>
          {ai.loading && !ai.data && <Loading />}
          {ai.data && (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <div className="flex flex-col gap-5">
                <div className="sketch-soft bg-paper-2 p-4 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-hand text-lg">
                    <ShieldCheck className="size-5" /> {locale === "ar" ? "مزودو المنصة المفعّلون" : "Platform providers enabled"}
                  </div>
                  {ai.data.platform_providers.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ai.data.platform_providers.map((p, i) => (
                        <Badge key={p} tone="sky">
                          {i + 1}. {p}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-ink-soft">
                      {locale === "ar" ? "لا يوجد مزود مُعد على الخادم. أضف مفتاحك الخاص أدناه." : "No platform provider is configured on the server. Add your own key below."}
                    </p>
                  )}
                </div>
                <Field group label={locale === "ar" ? "مصدر الذكاء الاصطناعي" : "Which AI should Wasl use?"}>
                  <Segmented
                    ariaLabel="AI mode"
                    value={ai.data.ai_mode}
                    onChange={(v) => savePrefs({ ai_mode: v })}
                    options={(["platform", "personal_first", "personal"] as const).map((m) => ({ value: m, label: modeLabels[m] }))}
                  />
                </Field>
                <label className="flex items-start gap-3">
                  <Switch checked={ai.data.allow_platform_fallback} onCheckedChange={(v) => savePrefs({ allow_platform_fallback: v })} disabled={ai.data.ai_mode === "platform"} />
                  <span className="text-sm">
                    <b>{locale === "ar" ? "السماح بالرجوع لمزودي المنصة" : "Allow fallback to platform AI"}</b>
                    <span className="block text-xs text-ink-faint">
                      {locale === "ar" ? "إذا فشل مفتاحك، استخدم مفاتيح وصل." : "If your key fails or is missing, use Wasl's providers."}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <Switch checked={ai.data.allow_cross_provider} onCheckedChange={(v) => savePrefs({ allow_cross_provider: v })} />
                  <span className="text-sm">
                    <b>{locale === "ar" ? "السماح بالتبديل بين الشركات" : "Allow switching provider companies"}</b>
                    <span className="block text-xs text-ink-faint">
                      {locale === "ar"
                        ? "عند الإيقاف، لا تُرسل بياناتك إلا إلى أول مزود (خصوصية أعلى، موثوقية أقل)."
                        : "When off, your data is only ever sent to the first provider (more privacy, less resilience)."}
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 font-hand text-xl">
                  <KeyRound className="size-5" /> {locale === "ar" ? "مفاتيحك الخاصة (اختياري)" : "Your own API keys (optional)"}
                </div>
                {ai.data.byok_providers.map((p) => (
                  <KeyRow key={p} provider={p} saved={ai.data!.keys.find((k) => k.provider === p)} onChange={ai.reload} />
                ))}
                <p className="flex items-start gap-2 text-xs text-ink-faint">
                  <Lock className="mt-0.5 size-3.5 shrink-0" />
                  {locale === "ar"
                    ? "نتحقق من المفتاح مع المزود ثم نحفظه مشفراً (Fernet). لا يُعرض مرة أخرى، ولا يُسجل في المراقبة."
                    : "Keys are validated with the provider, then stored encrypted (Fernet). They are never shown again and never logged."}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
