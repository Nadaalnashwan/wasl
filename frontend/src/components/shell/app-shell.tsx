"use client";

import {
  Activity,
  Award,
  Briefcase,
  FileText,
  Languages,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  PenLine,
  Scissors,
  Settings,
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

/**
 * v1's navigation, in v1's order. Achievements (v2) lives in the Workspace group, after the three v1 items, so
 * everything a v1 user knows is still where they left it.
 */
const NAV: { group: TKey; items: NavItem[] }[] = [
  {
    group: "nav.group.workspace",
    items: [
      { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
      { href: "/studio", key: "nav.studio", icon: PenLine },
      { href: "/cv", key: "nav.cv", icon: FileText },
      { href: "/achievements", key: "nav.achievements", icon: Award },
    ],
  },
  {
    group: "nav.group.career",
    items: [
      { href: "/jobs", key: "nav.jobs", icon: Briefcase },
      { href: "/tailor", key: "nav.tailor", icon: Scissors },
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

/** v1's theme and language pills ("Blueprint" / "Paper", "العربية" / "English"). */
export function Toggles({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const pill = "ink-btn inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-surface px-3 text-sm font-semibold text-fg";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button type="button" onClick={toggle} className={pill} aria-label={theme === "dark" ? t("theme.light") : t("theme.dark")}>
        {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
        <span className={compact ? "sr-only" : "hidden sm:inline"}>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
      </button>
      <button type="button" onClick={() => setLocale(locale === "ar" ? "en" : "ar")} className={pill} lang={locale === "ar" ? "en" : "ar"}>
        <Languages className="size-4" aria-hidden />
        {locale === "ar" ? "English" : "العربية"}
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
        "flex h-11 items-center gap-3 rounded-[12px] border-[1.5px] px-3 text-[15px] font-semibold transition-colors",
        active
          ? "border-ink bg-primary-soft text-fg shadow-[3px_3px_0_var(--ink-shadow)] rtl:shadow-[-3px_3px_0_var(--ink-shadow)]"
          : "border-transparent text-fg-2 hover:border-ink/25 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {t(item.key)}
    </Link>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 px-3 text-[11px] font-bold tracking-[0.16em] text-fg-3 uppercase rtl:tracking-normal">{children}</div>;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group}>
          <GroupLabel>{t(g.group)}</GroupLabel>
          <ul className="flex flex-col gap-1">
            {g.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <GroupLabel>{t("nav.group.system")}</GroupLabel>
        <ul className="flex flex-col gap-1">
          {/* v1 "Monitoring". Visibility only: the admin console is enforced server-side (proxy + backend role check). */}
          {user?.role === "admin" && (
            <li>
              <NavLink item={{ href: "/admin/monitoring", key: "nav.admin", icon: Activity }} onNavigate={onNavigate} />
            </li>
          )}
          <li>
            <NavLink item={{ href: "/settings", key: "nav.settings", icon: Settings }} onNavigate={onNavigate} />
          </li>
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
    <div className="ink-soft flex items-center gap-3 p-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-primary-soft text-sm font-extrabold text-fg" aria-hidden>
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-fg">{name}</div>
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
    <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-7 overflow-y-auto border-e-[1.5px] border-ink bg-surface px-4 py-5 md:flex">
        <Logo className="px-2" href="/dashboard" imageClassName="h-8" />
        <NavList />
        <div className="mt-auto flex flex-col gap-3 pt-2">
          <Toggles />
          <UserBox />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b-[1.5px] border-ink bg-surface px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ink-btn grid size-10 place-items-center rounded-[10px] bg-surface text-fg"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
        </button>
        <Logo href="/dashboard" />
        <Toggles className="ms-auto" compact />
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
          <div className="fade-in absolute inset-y-0 start-0 flex w-[82vw] max-w-[296px] flex-col gap-6 overflow-y-auto border-e-[1.5px] border-ink bg-surface px-4 py-5">
            <div className="flex items-center px-2">
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
            <div className="mt-auto">
              <UserBox />
            </div>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 px-4 py-8 sm:px-6 md:px-10 md:py-10 lg:px-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
