"use client";

/*
 * Wasl homepage — the original (v1) composition, matured.
 * Kept from v1: the pill navigation, the split hero with the framed Wasl machine, the ruled "How the Wasl machine
 * works" band with stations joined by drawn arrows, ink-outlined cards with a solid offset shadow, and the sky
 * closing card with the chart. Matured: line illustrations instead of doodles, a calmer type scale, real spacing
 * rhythm, RTL-aware shadows and arrows, and a blueprint dark theme instead of a plain inversion.
 */

import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  CircleSlash,
  Download,
  EyeOff,
  FileText,
  KeyRound,
  Languages,
  Moon,
  PenLine,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Target,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { ChartArt, StationArt, WaslMachine, type Station } from "@/components/brand/art";
import { claimStatusLabel, type ClaimStatus } from "@/components/claims";
import { Logo } from "@/components/shell/app-shell";
import { Marked } from "@/components/ui/marked";
import { useI18n, type TKey } from "@/lib/i18n";
import { useTheme } from "@/lib/providers";
import { cn } from "@/lib/utils";

const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const pillBase = "ink-pill inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap focus-visible:outline-offset-4";

const NAV: { href: string; key: TKey }[] = [
  { href: "#how", key: "landing2.nav.how" },
  { href: "#evidence", key: "landing2.nav.evidence" },
  { href: "#features", key: "landing2.nav.features" },
];

/** A drawn connector between stations; mirrors itself in RTL. */
function DrawnArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 24" fill="none" className={cn("rtl:-scale-x-100", className)} aria-hidden>
      <path d="M3 14c12-7 27-9 52-3" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M47 4.5 56.5 11 47.5 18" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ navigation */
function HomeNav() {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <header className={cn(wrap, "flex h-20 items-center gap-2 sm:gap-3")}>
      <Logo className="shrink-0" imageClassName="h-7 sm:h-8" />
      <nav aria-label={t("landing2.nav.label")} className="ms-8 hidden lg:block">
        <ul className="flex items-center gap-6">
          {NAV.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm font-semibold text-fg-2 underline-offset-8 transition-colors hover:text-fg hover:underline">
                {t(l.key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ms-auto flex items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={toggle}
          className={cn(pillBase, "h-9 bg-surface px-2.5 text-sm text-fg sm:px-3")}
          aria-label={dark ? t("theme.light") : t("theme.dark")}
        >
          {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{dark ? t("landing2.v1.theme.light") : t("landing2.v1.theme.dark")}</span>
        </button>
        <button
          type="button"
          onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          className={cn(pillBase, "h-9 bg-surface px-2.5 text-sm text-fg sm:px-3")}
          lang={locale === "ar" ? "en" : "ar"}
        >
          <Languages className="size-4" aria-hidden />
          <span className="sr-only min-[400px]:not-sr-only">{t("landing2.v1.lang")}</span>
        </button>
        <Link href="/login" className={cn(pillBase, "hidden h-9 bg-surface px-3 text-sm text-fg sm:inline-flex")}>
          {t("landing.signin")}
        </Link>
        <Link href="/register" className={cn(pillBase, "h-9 bg-primary px-2.5 text-[13px] text-on-primary sm:px-3 sm:text-sm")}>
          {t("landing2.cta")}
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */
function Hero() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="hero-title" className={cn(wrap, "grid items-center gap-12 pt-6 pb-20 md:pt-10 md:pb-24 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14")}>
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-primary-soft px-3.5 py-1 text-sm font-bold text-fg">
          <ShieldCheck className="size-4 text-primary-text" aria-hidden />
          {t("landing2.v1.badge")}
        </p>
        <h1
          id="hero-title"
          className="font-display mt-7 text-[2.6rem] leading-[1.06] tracking-[-0.02em] text-fg sm:text-[3.3rem] lg:text-[3.55rem] rtl:leading-[1.3] rtl:tracking-normal"
        >
          <span className="block">
            <Marked text={t("landing2.hero.t1")} mark={t("landing2.hero.mark")} />
          </span>
          <span className="block">{t("landing2.hero.t2")}</span>
        </h1>
        <p className="mt-7 max-w-xl text-base leading-relaxed text-fg-2 sm:text-[17px]">{t("landing2.hero.sub")}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3.5">
          <Link href="/register" className={cn(pillBase, "h-12 bg-primary px-6 text-[15px] text-on-primary")}>
            {t("landing2.hero.cta")}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <a href="#how" className={cn(pillBase, "h-12 bg-surface px-6 text-[15px] text-fg")}>
            {t("landing2.v1.secondary")}
          </a>
        </div>
        <p className="mt-6 text-sm text-fg-3">{t("landing2.hero.note")}</p>
      </div>

      <figure className="ink-card p-4 sm:p-6">
        <div className="rounded-xl bg-paper-ruled px-3 py-5 sm:px-6 sm:py-7">
          <WaslMachine className="h-auto w-full" label={t("landing2.hero.art")} />
        </div>
        <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 pt-4 text-xs font-bold text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" aria-hidden />
            {t("landing2.hero.art.in")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            {t("landing2.hero.art.check")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ok" aria-hidden />
            {t("landing2.hero.art.out")}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

/* ------------------------------------------------------------------ the machine, station by station */
const STATIONS: Station[] = ["document", "check", "approve", "reuse"];

function Machine() {
  const { t } = useI18n();
  return (
    <section id="how" aria-labelledby="how-title" className="ink-ruled scroll-mt-6 py-20 md:py-24">
      <div className={wrap}>
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="how-title" className="font-display text-[2rem] leading-tight text-fg sm:text-[2.6rem]">
            <span className="brand-underline [&::after]:inset-x-0 [&::after]:mx-auto [&::after]:w-full">{t("landing2.v1.how.title")}</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-fg-2 sm:text-base">{t("landing2.how.sub")}</p>
        </div>

        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          {STATIONS.map((kind, i) => {
            const n = i + 1;
            return (
              <li key={kind} className="relative">
                <article className="ink-card flex h-full flex-col items-center px-5 pt-6 pb-7 text-center">
                  <div className="grid h-32 w-full place-items-center">
                    <StationArt kind={kind} className="h-28 w-auto" />
                  </div>
                  <p className="num mt-4 text-xs font-bold tracking-[0.18em] text-fg-3">{String(n).padStart(2, "0")}</p>
                  <h3 className="mt-1.5 text-lg font-extrabold text-fg">{t(`landing2.how.s${n}.t` as TKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">{t(`landing2.how.s${n}.d` as TKey)}</p>
                  <p className="mt-auto pt-4 text-xs font-semibold text-primary-text">{t(`landing2.how.s${n}.m` as TKey)}</p>
                </article>
                {n < STATIONS.length && <DrawnArrow className="absolute top-[4.5rem] -end-[2.85rem] hidden w-10 lg:block" />}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ evidence checks */
const STATUS_ROWS: { status: ClaimStatus; icon: React.ElementType; tone: string; fill: string; key: TKey }[] = [
  { status: "supported", icon: CheckCircle2, tone: "text-ok", fill: "bg-ok-soft", key: "landing2.ev.supported" },
  { status: "needs_confirmation", icon: UserCheck, tone: "text-warn", fill: "bg-warn-soft", key: "landing2.ev.needs_confirmation" },
  { status: "unsupported", icon: CircleSlash, tone: "text-bad", fill: "bg-bad-soft", key: "landing2.ev.unsupported" },
  { status: "contradicted", icon: ShieldAlert, tone: "text-bad", fill: "bg-bad-soft", key: "landing2.ev.contradicted" },
];

function Evidence() {
  const { t, locale } = useI18n();
  const principles: { t: TKey; d: TKey }[] = [
    { t: "landing2.ev.p1.t", d: "landing2.ev.p1.d" },
    { t: "landing2.ev.p2.t", d: "landing2.ev.p2.d" },
    { t: "landing2.ev.p3.t", d: "landing2.ev.p3.d" },
  ];
  return (
    <section id="evidence" aria-labelledby="evidence-title" className="scroll-mt-6 py-20 md:py-28">
      <div className={cn(wrap, "grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20")}>
        <div>
          <p className="text-sm font-bold text-primary-text">{t("landing2.ev.eyebrow")}</p>
          <h2 id="evidence-title" className="font-display mt-3 text-[2rem] leading-tight text-fg sm:text-[2.5rem] rtl:leading-snug">
            <span className="brand-underline">{t("landing2.ev.title")}</span>
          </h2>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg-2 sm:text-base">{t("landing2.ev.sub")}</p>
          <ol className="mt-9 flex max-w-xl flex-col gap-5">
            {principles.map((p, i) => (
              <li key={p.t} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4">
                <span className="num grid size-9 place-items-center rounded-full border-[1.5px] border-ink bg-primary-soft text-sm font-extrabold text-fg">{i + 1}</span>
                <div>
                  <h3 className="text-[15px] font-bold text-fg">{t(p.t)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">{t(p.d)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="ink-card overflow-hidden">
          <div className="flex items-center gap-4 border-b-[1.5px] border-ink bg-primary-soft px-6 py-4">
            <StationArt kind="check" className="h-12 w-auto" />
            <div>
              <h3 className="text-sm font-extrabold text-fg">{t("landing2.ev.statuses")}</h3>
              <p className="text-xs text-fg-2">{t("landing2.v1.ev.cta")}</p>
            </div>
          </div>
          <dl className="divide-y divide-border-soft">
            {STATUS_ROWS.map(({ status, icon: Icon, tone, fill, key }) => (
              <div key={status} className="px-6 py-4">
                <dt className={cn("flex items-center gap-3.5 text-sm font-extrabold", tone)}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", fill)} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  {claimStatusLabel(status, locale)}
                </dt>
                <dd className="mt-1 ps-[2.75rem] text-sm leading-relaxed text-fg-2">{t(key)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ features: v1's card grid, one colour per area */
function Features() {
  const { t } = useI18n();
  const cards: { icon: React.ElementType; t: TKey; d: TKey; tone: string }[] = [
    { icon: PenLine, t: "landing2.f.studio.t", d: "landing2.f.studio.d", tone: "tone-brand" },
    { icon: FileText, t: "landing2.f.cv.t", d: "landing2.f.cv.d", tone: "tone-sky" },
    { icon: ScanSearch, t: "landing2.f.tailor.t", d: "landing2.f.tailor.d", tone: "tone-violet" },
    { icon: Target, t: "landing2.f.gap.t", d: "landing2.f.gap.d", tone: "tone-teal" },
    { icon: Briefcase, t: "landing2.f.jobs.t", d: "landing2.f.jobs.d", tone: "tone-green" },
    { icon: Languages, t: "landing2.f.lang.t", d: "landing2.f.lang.d", tone: "tone-amber" },
  ];
  const privacy: { icon: React.ElementType; t: TKey; d: TKey }[] = [
    { icon: EyeOff, t: "landing2.pv.pii.t", d: "landing2.pv.pii.d" },
    { icon: KeyRound, t: "landing2.pv.byok.t", d: "landing2.pv.byok.d" },
    { icon: Download, t: "landing2.pv.data.t", d: "landing2.pv.data.d" },
  ];
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-6 pb-20 md:pb-28">
      <div className={wrap}>
        <h2 id="features-title" className="font-display text-[2rem] leading-tight text-fg sm:text-[2.5rem]">
          <span className="brand-underline">{t("landing2.v1.f.title")}</span>
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ icon: Icon, t: tk, d, tone }) => (
            <article key={tk} className={cn(tone, "ink-card p-6 sm:p-7")}>
              <span className="grid size-11 place-items-center rounded-xl border-[1.5px] border-ink bg-tone-soft text-tone" aria-hidden>
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-extrabold text-fg">{t(tk)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{t(d)}</p>
            </article>
          ))}
        </div>

        <div className="ink-card mt-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:gap-10">
          <div>
            <p className="text-sm font-bold text-primary-text">{t("landing2.pv.eyebrow")}</p>
            <h3 className="font-display mt-2 text-2xl leading-tight text-fg">{t("landing2.pv.title")}</h3>
          </div>
          <ul className="grid gap-6 sm:grid-cols-3">
            {privacy.map(({ icon: Icon, t: tk, d }) => (
              <li key={tk}>
                <Icon className="size-5 text-primary-text" aria-hidden />
                <h4 className="mt-3 text-sm font-extrabold text-fg">{t(tk)}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{t(d)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ closing card */
function Closing() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="end-title" className="pb-24 md:pb-32">
      <div className={wrap}>
        <div className="ink-card grid items-center gap-8 !bg-primary-soft px-6 py-9 sm:px-10 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-10 md:py-11">
          <div className="hidden rounded-xl border-[1.5px] border-ink bg-surface p-4 md:block">
            <ChartArt className="h-28 w-auto" />
          </div>
          <div className="max-w-xl">
            <h2 id="end-title" className="font-display text-[2rem] leading-tight text-fg sm:text-[2.4rem]">
              {t("landing2.end.title")}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t("landing2.end.sub")}</p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <Link href="/register" className={cn(pillBase, "h-12 bg-primary px-6 text-[15px] text-on-primary")}>
              {t("landing2.hero.cta")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
            <Link href="/login" className="text-sm font-semibold text-primary-text hover:underline">
              {t("landing2.end.signin")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t-[1.5px] border-ink bg-surface">
      <div className={cn(wrap, "flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between")}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Logo imageClassName="h-7" />
          <p className="text-sm text-fg-2">
            {t("landing2.foot.rights")} — {t("brand.tagline")}
          </p>
        </div>
        <nav aria-label={t("landing2.foot.account")} className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link href="/login" className="font-semibold text-fg-2 hover:text-fg">
            {t("landing.signin")}
          </Link>
          <Link href="/register" className="font-semibold text-fg-2 hover:text-fg">
            {t("landing2.cta")}
          </Link>
        </nav>
      </div>
      <p className={cn(wrap, "pb-8 text-xs text-fg-3")}>{t("landing2.v1.foot.credit")}</p>
    </footer>
  );
}

export function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <HomeNav />
      <main id="main" className="flex-1">
        <Hero />
        <Machine />
        <Evidence />
        <Features />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
