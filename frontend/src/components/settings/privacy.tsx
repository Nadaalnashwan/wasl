"use client";

import { Download, EyeOff, FileText, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api, ApiError, download } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useAuth, useToast } from "@/lib/providers";
import type { CV } from "@/lib/types";
import { providerName, RowGroup, type AiSettings, SettingsSection } from "./shared";

export function PrivacySection({ ai }: { ai: AiSettings | null }) {
  const { t } = useI18n();
  const personal = (ai?.keys ?? []).filter((k) => k.status === "valid").map((k) => k.provider);
  const platform = ai?.platform_providers ?? [];
  const points = [
    { icon: <EyeOff />, title: t("settings2.privacy.redact.t"), text: t("settings2.privacy.redact.d") },
    { icon: <FileText />, title: t("settings2.privacy.logs.t"), text: t("settings2.privacy.logs.d") },
    { icon: <KeyRound />, title: t("settings2.privacy.keys.t"), text: t("settings2.privacy.keys.d") },
  ];
  return (
    <SettingsSection id="privacy" title={t("settings2.sec.privacy")} description={t("settings2.sec.privacy.d")}>
      <ul className="flex max-w-2xl flex-col gap-5">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-fg-3 [&_svg]:size-4" aria-hidden>
              {p.icon}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-fg">{p.title}</h3>
              <p className="mt-0.5 text-sm leading-relaxed text-fg-2">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-7 max-w-2xl border-t border-border pt-5">
        <h3 className="text-sm font-medium text-fg">{t("settings2.privacy.providers")}</h3>
        {ai && !platform.length && !personal.length ? (
          <p className="mt-1 text-sm text-fg-3">{t("settings2.privacy.providers.none")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {platform.map((p) => (
              <li key={`p-${p}`} className="flex items-center gap-2">
                <span className="text-fg">{providerName(p)}</span>
                <Badge tone="neutral">{t("settings2.privacy.providers.platform")}</Badge>
              </li>
            ))}
            {personal.map((p) => (
              <li key={`u-${p}`} className="flex items-center gap-2">
                <span className="text-fg">{providerName(p)}</span>
                <Badge tone="brand">{t("settings2.privacy.providers.personal")}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-fg-3">{t("settings2.privacy.providers.note")}</p>
      </div>
    </SettingsSection>
  );
}

export function DataSection() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const master = useApi<CV | null>("/api/cv/master");
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const matches = !!user && typed.trim().toLowerCase() === user.email.toLowerCase();

  async function exportCv(format: "pdf" | "docx") {
    if (!master.data) return;
    setExporting(format);
    try {
      await download(`/api/cv/${master.data.id}/export?format=${format}`, `wasl_cv.${format}`);
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setExporting(null);
    }
  }

  async function deleteAccount() {
    if (!matches) return;
    setDeleting(true);
    try {
      await api("/api/auth/me", { method: "DELETE" });
      toast("ok", t("settings2.data.deleted"));
      await logout().catch(() => undefined);
      router.replace("/");
    } catch (e) {
      toast("error", (e as ApiError).message);
      setDeleting(false);
    }
  }

  return (
    <SettingsSection id="data" title={t("settings2.sec.data")} description={t("settings2.sec.data.d")}>
      <RowGroup>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-fg">{t("settings2.data.export")}</h3>
            <p className="mt-0.5 text-sm text-fg-3">
              {master.loading ? t("common.loading") : master.data ? t("settings2.data.export.d") : t("settings2.data.export.none")}
            </p>
          </div>
          {master.data && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => exportCv("pdf")} loading={exporting === "pdf"} disabled={exporting !== null}>
                {exporting !== "pdf" && <Download />}
                PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={() => exportCv("docx")} loading={exporting === "docx"} disabled={exporting !== null}>
                {exporting !== "docx" && <Download />}
                Word
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-bad">{t("settings2.data.delete")}</h3>
            <p className="mt-0.5 max-w-xl text-sm text-fg-3">{t("settings2.data.delete.d")}</p>
          </div>
          <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
            <Trash2 />
            {t("settings2.data.delete")}
          </Button>
        </div>
      </RowGroup>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (deleting) return;
          setOpen(o);
          if (!o) setTyped("");
        }}
      >
        <DialogContent
          title={t("settings2.data.delete.title")}
          description={t("settings2.data.delete.d")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={deleting}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger-solid" onClick={deleteAccount} loading={deleting} disabled={!matches}>
                {t("settings2.data.delete.button")}
              </Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              deleteAccount();
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-fg-2">{t("settings2.data.delete.linkedin")}</p>
            <Field label={t("settings2.data.delete.type")} hint={<span className="font-mono" dir="ltr">{user?.email}</span>}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} dir="ltr" autoFocus />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
