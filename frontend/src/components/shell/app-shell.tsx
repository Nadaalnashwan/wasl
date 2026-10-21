
"use client";

import {
  Activity,
  Briefcase,
  FileText,
  Languages,
  LayoutDashboard,
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
import { Gear } from "@/components/sketch/illustrations";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth, useTheme } from "@/lib/providers";
import { cn } from "@/lib/utils";

const NAV: {
  group: TKey;
  items: { href: string; key: TKey; icon: React.ElementType }[];
}[] = [
  {
    group: "nav.group.workspace",
    items: [
      { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
      { href: "/studio", key: "nav.studio", icon: PenLine },
      { href: "/cv", key: "nav.cv", icon: FileText },
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
  {
    group: "nav.group.system",
    items: [
      { href: "/monitoring", key: "nav.monitoring", icon: Activity },
      { href: "/settings", key: "nav.settings", icon: Settings },
    ],
  },
];

export function Logo({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2", className)}
      aria-label="Wasl home"
    >
      <>
        <Image
          src="/brand/Wasl-logo-light.png"
          alt=""
          width={1410}
          height={442}
          className={cn("h-8 w-auto dark:hidden", imageClassName)}
          priority
        />
        <Image
          src="/brand/Wasl-logo-dark.png"
          alt=""
          width={1410}
          height={442}
          className={cn("hidden h-8 w-auto dark:block", imageClassName)}
          priority
        />
      </>
    </Link>
  );
}

export function Toggles({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { locale, setLocale, t } = useI18n();

  return (
    <div className={cn("flex gap-2", className)}>
      <button
        onClick={toggle}
        className="sketch-btn flex h-9 items-center gap-1.5 bg-paper px-3 font-hand text-base"
        aria-label={
          theme === "dark" ? t("theme.light") : t("theme.dark")
        }
      >
        {theme === "dark" ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
        <span className="hidden sm:inline">
          {theme === "dark" ? t("theme.light") : t("theme.dark")}
        </span>
      </button>

      <button
        onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
        className="sketch-btn flex h-9 items-center gap-1.5 bg-paper px-3 font-hand text-base"
        aria-label="Switch language"
      >
        <Languages className="size-4" />
        {locale === "ar" ? "English" : "العربية"}
      </button>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-2 px-3 text-[11px] font-bold tracking-[0.18em] text-ink-faint uppercase">
            {t(g.group)}
          </div>

          <ul className="flex flex-col gap-1">
            {g.items.map(({ href, key, icon: Icon }) => {
              const active =
                pathname === href ||
                pathname.startsWith(href + "/");

              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 px-3 py-2 font-hand text-lg transition-colors",
                      active
                        ? "border-ink bg-sky shadow-[3px_3px_0_var(--shadow)]"
                        : "border-transparent hover:border-ink/30 hover:bg-paper-3"
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBox() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  if (!user) return null;

  const initials = (user.full_name || user.email)
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="sketch-soft flex items-center gap-3 p-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-sky font-hand text-lg">
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">
          {user.full_name || user.email.split("@")[0]}
        </div>
        <div className="truncate text-xs text-ink-faint">
          {user.email}
        </div>
      </div>

      <button
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
        className="rounded-lg p-2 hover:bg-paper-3"
        aria-label={t("nav.signout")}
        title={t("nav.signout")}
      >
        <LogOut className="size-4 rtl:rotate-180" />
      </button>
    </div>
  );
}

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(
        `/login?next=${encodeURIComponent(pathname)}`
      );
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3 text-ink-soft">
          <Gear className="gear-spin size-14 text-ink" />
          <span className="font-hand text-xl">Wasl</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr] lg:grid-cols-[272px_1fr]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-e-[2.5px] border-ink bg-paper p-5 md:flex">
        <Logo />
        <NavList />

        <div className="mt-auto flex flex-col gap-3">
          <Toggles />
          <UserBox />
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b-[2.5px] border-ink bg-paper px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="sketch-btn grid size-10 place-items-center bg-paper"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        <Logo />

        <div className="ms-auto">
          <Toggles />
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setOpen(false)}
          />

          <div className="pop-in absolute inset-y-0 start-0 flex w-[82vw] max-w-[300px] flex-col gap-6 overflow-y-auto border-e-[2.5px] border-ink bg-paper p-5">
            <div className="flex items-center">
              <Logo />

              <button
                onClick={() => setOpen(false)}
                className="ms-auto rounded-lg p-2 hover:bg-paper-3"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <NavList onNavigate={() => setOpen(false)} />

            <div className="mt-auto">
              <UserBox />
            </div>
          </div>
        </div>
      )}

      <main
        id="main"
        className="min-w-0 px-4 py-8 md:px-8 lg:px-12"
      >
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
