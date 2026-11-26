"use client";

import { useEffect } from "react";
import { AiProvidersSection, ApiKeysSection } from "@/components/settings/ai";
import { callbackMessage, IntegrationsSection } from "@/components/settings/integrations";
import { DataSection, PrivacySection } from "@/components/settings/privacy";
import { AccountSection, AppearanceSection, ProfileSection } from "@/components/settings/profile";
import type { AiSettings } from "@/components/settings/shared";
import { PageHeader } from "@/components/ui/card";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { IntegrationStatus } from "@/lib/types";

export default function SettingsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const integrations = useApi<Record<string, IntegrationStatus>>("/api/integrations");
  const ai = useApi<AiSettings>("/api/settings/ai");

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

      {/* v1: two columns of cards. Personal settings on the start side, connections and AI on the end side. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <ProfileSection />
          <AppearanceSection />
          <AccountSection />
          <DataSection />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <IntegrationsSection data={integrations.data} error={integrations.error} reload={integrations.reload} />
          <AiProvidersSection {...aiProps} />
          <ApiKeysSection {...aiProps} />
          <PrivacySection ai={ai.data} />
        </div>
      </div>
    </div>
  );
}
