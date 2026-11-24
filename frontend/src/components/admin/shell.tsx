"use client";

import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Logo, Toggles } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/card";
import { API_URL } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AdminAccessProvider, useAdminAccess, useHealth } from "./context";

/* Separate admin application shell: compact top bar + horizontal section nav (no workspace sidebar). */

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
    <nav aria-label={t("admin2.nav.label")} className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <ul className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none]">
        {ADMIN_NAV.map((it) => {
          const active = pathname === it.href;
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.keepQuery && qs ? `${it.href}?${qs}` : it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 text-sm whitespace-nowrap transition-colors",
                  active ? "border-primary font-medium text-fg" : "border-transparent text-fg-3 hover:text-fg",
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

function TopBar({ showNav }: { showNav: boolean }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
        <Logo href="/admin/monitoring" imageClassName="h-6" />
        <span className="text-border-strong" aria-hidden>
          /
        </span>
        <span className="truncate text-sm font-semibold text-fg">{t("admin2.console")}</span>
        {showNav && <EnvBadge />}
        <div className="ms-auto flex items-center gap-1">
          <Toggles />
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="rtl:rotate-180" aria-hidden />
              <span className="hidden sm:inline">{t("admin2.workspace")}</span>
              <span className="sr-only sm:hidden">{t("admin2.workspace.long")}</span>
            </Link>
          </Button>
        </div>
      </div>
      {showNav && <SectionNav />}
    </header>
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
    <div className="min-h-screen bg-bg">
      <TopBar showNav={ok} />
      <main id="main" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:py-8">
        {ok ? children : <GateScreen kind={access} />}
      </main>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminAccessProvider>
      <Frame>{children}</Frame>
    </AdminAccessProvider>
  );
}
