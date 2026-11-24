"use client";

import { useEffect, useState } from "react";
import { AiProvidersSection, ApiKeysSection } from "@/components/settings/ai";
import { callbackMessage, IntegrationsSection } from "@/components/settings/integrations";
import { DataSection, PrivacySection } from "@/components/settings/privacy";
import { AccountSection, AppearanceSection, ProfileSection } from "@/components/settings/profile";
import type { AiSettings } from "@/components/settings/shared";
import { PageHeader } from "@/components/ui/card";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { IntegrationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SECTIONS: { id: string; key: TKey }[] = [
  { id: "profile", key: "settings2.sec.profile" },
  { id: "account", key: "settings2.sec.account" },
  { id: "appearance", key: "settings2.sec.appearance" },
  { id: "integrations", key: "settings2.sec.integrations" },
  { id: "ai", key: "settings2.sec.ai" },
  { id: "keys", key: "settings2.sec.keys" },
  { id: "privacy", key: "settings2.sec.privacy" },
  { id: "data", key: "settings2.sec.data" },
];

/** Highlights the section currently in view. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
        const first = ids.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);
  return [active, setActive] as const;
}

const IDS = SECTIONS.map((s) => s.id);

export default function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const integrations = useApi<Record<string, IntegrationStatus>>("/api/integrations");
  const ai = useApi<AiSettings>("/api/settings/ai");
  const [active, setActive] = useActiveSection(IDS);

  // OAuth callback lands on /settings?integration=..&result=..
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const which = p.get("integration");
    const result = p.get("result");
    if (which && result) {
      const msg = callbackMessage(t, which, result);
      toast(msg.ok ? "ok" : "error", msg.text);
      window.history.replaceState(null, "", "/settings#integrations");
      document.getElementById("integrations")?.scrollIntoView({ block: "start" });
    }
  }, [toast, t]);

  const aiProps = { data: ai.data, error: ai.error, loading: ai.loading, reload: ai.reload, setData: (d: AiSettings) => ai.setData(d) };

  return (
    <div>
      <PageHeader title={t("set.title")} sub={t("settings2.sub")} />

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label={t("settings2.nav")} className="mb-8 lg:mb-0">
          <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-8 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  aria-current={active === s.id ? "location" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                    active === s.id ? "bg-surface-2 font-medium text-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {t(s.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <ProfileSection />
          <AccountSection />
          <AppearanceSection />
          <IntegrationsSection data={integrations.data} error={integrations.error} reload={integrations.reload} />
          <AiProvidersSection {...aiProps} />
          <ApiKeysSection {...aiProps} />
          <PrivacySection ai={ai.data} />
          <DataSection />
        </div>
      </div>
    </div>
  );
}
