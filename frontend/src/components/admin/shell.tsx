"use client";

import { Activity, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AdminAccessProvider, useAdminAccess, useHealth } from "./context";

/* v1 placement: Monitoring lives inside the workspace (System group). The admin gate is unchanged: the proxy checks the
 * admin session cookie server-side, AdminAccessProvider re-verifies the role, and every API call is authorised again. */

type Item = { href: string; key: TKey; keepQuery?: boolean };

export const ADMIN_NAV: Item[] = [
  { href: "/admin/monitoring", key: "admin2.nav.overview", keepQuery: true },
  { href: "/admin/monitoring/health", key: "admin2.nav.health", keepQuery: true },
  { href: "/admin/monitoring/ai", key: "admin2.nav.ai", keepQuery: true },
  { href: "/admin/monitoring/quality", key: "admin2.nav.quality", keepQuery: true },
  { href: "/admin/monitoring/evaluation", key: "admin2.nav.eval" },
  { href: "/admin/monitoring/models", key: "admin2.nav.models", keepQuery: true },
  { href: "/admin/monitoring/cost", key: "admin2.nav.cost", keepQuery: true },
  { href: "/admin/monitoring/alerts", key: "admin2.nav.alerts" },
  { href: "/admin/audit", key: "admin2.nav.audit" },
];

function SectionNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useI18n();
  // carry the shared date-range / provider / model / task filters between data sections
  const qs = params.toString();
  return (
    <nav aria-label={t("admin2.nav.label")}>
      <ul className="flex flex-wrap gap-2 p-0.5">
        {ADMIN_NAV.map((it) => {
          const active = pathname === it.href;
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.keepQuery && qs ? `${it.href}?${qs}` : it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border-[1.5px] border-ink px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
                  active ? "bg-ink text-bg" : "bg-surface text-fg hover:bg-primary-soft",
                )}
              >
                {t(it.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Environment badge: backend-reported environment when available, else the public build setting, else the API host. */
function EnvBadge() {
  const { t } = useI18n();
  const health = useHealth();
  const reported = health.data?.environment || process.env.NEXT_PUBLIC_APP_ENV || null;
  let host = "";
  try {
    host = new URL(API_URL).hostname;
  } catch {
    host = API_URL;
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(host);
  const env = reported ?? (local ? t("admin2.env.local") : null);
  const tone: BadgeTone = !env ? "outline" : /prod/i.test(env) ? "bad" : /stag|preview/i.test(env) ? "warn" : "neutral";
  const db = health.data?.database;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Badge tone={tone} className="uppercase" title={`${t("admin2.env.label")}: ${env ?? host}`}>
        <span className="sr-only">{t("admin2.env.label")}: </span>
        {env ?? `${t("admin2.env.api")} · ${host}`}
      </Badge>
      {db && (
        <span className="hidden items-center gap-1.5 text-xs text-fg-3 sm:inline-flex" title={db.ok ? "Database reachable" : `Database error: ${db.error ?? "unknown"}`}>
          <span className={cn("size-1.5 rounded-full", db.ok ? "bg-ok" : "bg-bad")} aria-hidden />
          {db.engine} {db.ok ? "ok" : "unreachable"}
        </span>
      )}
    </div>
  );
}

function ConsoleBar({ showNav }: { showNav: boolean }) {
  const { t } = useI18n();
  return (
    <div className="mb-8 flex flex-col gap-4 border-b-[1.5px] border-ink pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink bg-primary-soft text-fg" aria-hidden>
          <Activity className="size-[18px]" />
        </span>
        <span className="font-display text-xl text-fg">{t("nav.admin")}</span>
        <span className="text-sm text-fg-3">· {t("admin2.console")}</span>
        {showNav && <EnvBadge />}
      </div>
      {showNav && <SectionNav />}
    </div>
  );
}

function GateScreen({ kind }: { kind: "checking" | "denied" | "error" }) {
  const { t } = useI18n();
  const { recheck } = useAdminAccess();
  if (kind === "checking") {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-fg-3" role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {t("admin2.verify")}
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center" role="alert">
      <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-fg-3">
        <ShieldAlert className="size-5" aria-hidden />
      </span>
      <h1 className="text-heading font-semibold text-fg">{kind === "denied" ? t("admin2.denied.title") : t("admin2.verifyError.title")}</h1>
      <p className="text-sm text-fg-2">{kind === "denied" ? t("admin2.denied.text") : t("admin2.verifyError.text")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {kind === "error" && (
          <Button variant="primary" onClick={recheck}>
            {t("common.retry")}
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link href="/dashboard">{t("admin2.denied.back")}</Link>
        </Button>
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { access } = useAdminAccess();
  const ok = access === "admin";
  return (
    <AppShell>
      <ConsoleBar showNav={ok} />
      {ok ? children : <GateScreen kind={access} />}
    </AppShell>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminAccessProvider>
      <Frame>{children}</Frame>
    </AdminAccessProvider>
  );
}
