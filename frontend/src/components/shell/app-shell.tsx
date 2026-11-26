"use client";

import {
  Award,
  Briefcase,
  FileText,
  Languages,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  Moon,
  PenLine,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import logoDark from "../../../public/brand/Wasl-logo-dark.png";
import logoLight from "../../../public/brand/Wasl-logo-light.png";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth, useTheme } from "@/lib/providers";
import { cn } from "@/lib/utils";

type NavItem = { href: string; key: TKey; icon: React.ElementType };

const NAV: { group: TKey; items: NavItem[] }[] = [
  {
    group: "nav.group.workspace",
    items: [
      { href: "/dashboard", key: "nav.dashboard", icon: LayoutGrid },
      { href: "/achievements", key: "nav.achievements", icon: Award },
      { href: "/cv", key: "nav.cv", icon: FileText },
      { href: "/studio", key: "nav.studio", icon: PenLine },
    ],
  },
  {
    group: "nav.group.career",
    items: [
      { href: "/jobs", key: "nav.jobs", icon: Briefcase },
      { href: "/tailor", key: "nav.tailor", icon: ScanSearch },
      { href: "/gap", key: "nav.gap", icon: Target },
    ],
  },
];

export function Logo({ className, imageClassName, href = "/" }: { className?: string; imageClassName?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center", className)} aria-label="Wasl">
      <Image src={logoLight} alt="" width={1410} height={442} className={cn("h-7 w-auto dark:hidden", imageClassName)} priority />
      <Image src={logoDark} alt="" width={1410} height={442} className={cn("hidden h-7 w-auto dark:block", imageClassName)} priority />
    </Link>
  );
}

/** Theme + language toggles (icon buttons). */
export function Toggles({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg";
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button type="button" onClick={toggle} className={btn} aria-label={theme === "dark" ? t("theme.light") : t("theme.dark")}>
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className={btn} aria-label="Switch language">
        <Languages className="size-4" />
        <span>{locale === "ar" ? "EN" : "عربي"}</span>
      </button>
    </div>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-sm font-semibold transition-colors",
        active
          ? "stamp bg-primary-soft text-fg ring-1 ring-primary/25"
          : "text-fg-2 hover:bg-surface hover:text-fg",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-fg-3")} />
      {t(item.key)}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-1.5 px-2.5 text-xs font-bold tracking-wide text-fg-3">{t(g.group)}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <div className="mb-1.5 px-2.5 text-xs font-bold tracking-wide text-fg-3">{t("nav.group.system")}</div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <NavLink item={{ href: "/settings", key: "nav.settings", icon: Settings }} onNavigate={onNavigate} />
          </li>
          {/* Visibility only — the admin console is enforced server-side (proxy + backend role check). */}
          {user?.role === "admin" && (
            <li>
              <NavLink item={{ href: "/admin/monitoring", key: "nav.admin", icon: ShieldCheck }} onNavigate={onNavigate} />
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}

function UserBox() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  if (!user) return null;
  const name = user.full_name || user.email.split("@")[0];
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">{initials}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{name}</div>
        <div className="truncate text-xs text-fg-3">{user.email}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
        className="grid size-8 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg"
        aria-label={t("nav.signout")}
        title={t("nav.signout")}
      >
        <LogOut className="size-4 rtl:rotate-180" />
      </button>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <Loader2 className="size-5 animate-spin text-fg-3" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (loading || !user) return <FullPageSpinner />;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-7 overflow-y-auto border-e border-border bg-sidebar px-3 py-5 md:flex">
        <Logo className="px-2.5" href="/dashboard" />
        <NavList />
        <div className="mt-auto flex flex-col gap-2 border-t border-border-soft pt-3">
          <Toggles className="px-1" />
          <UserBox />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border-soft bg-sidebar/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ms-1.5 grid size-9 place-items-center rounded-md text-fg-2 hover:bg-surface-2"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
        </button>
        <Logo href="/dashboard" />
        <Toggles className="ms-auto" />
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
          <div className="fade-in absolute inset-y-0 start-0 flex w-[82vw] max-w-[288px] flex-col gap-6 overflow-y-auto border-e border-border-soft bg-sidebar px-3 py-4">
            <div className="flex items-center px-2.5">
              <Logo href="/dashboard" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ms-auto grid size-8 place-items-center rounded-md text-fg-3 hover:bg-surface-2"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-border pt-3">
              <UserBox />
            </div>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 px-4 py-7 sm:px-6 md:px-12 md:py-12">
        <div className="mx-auto max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
