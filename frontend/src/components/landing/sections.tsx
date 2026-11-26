"use client";

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
  PenLine,
  ScanSearch,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Target,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { ChartArt, SpotArt, StationArt, type Station } from "@/components/brand/art";
import { claimStatusLabel, type ClaimStatus } from "@/components/claims";
import { ProductPreview } from "@/components/landing/product-preview";
import { Logo, Toggles } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export const NAV_LINKS: { href: string; key: TKey }[] = [
  { href: "#how", key: "landing2.nav.how" },
  { href: "#evidence", key: "landing2.nav.evidence" },
  { href: "#features", key: "landing2.nav.features" },
  { href: "#privacy", key: "landing2.nav.privacy" },
];

function SectionIntro({
  id,
  eyebrow,
  title,
  sub,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-xl", className)}>
      <p className="mb-3 text-sm font-bold tracking-wide text-primary-text">{eyebrow}</p>
      <h2 id={id} className="font-display brand-underline text-3xl text-fg sm:text-[2.5rem] sm:leading-[1.1] rtl:leading-snug">
        {title}
      </h2>
      {sub && <p className="mt-4 text-[15px] leading-relaxed text-fg-2">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ top navigation */
export function LandingNav() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className={cn(wrap, "flex h-16 items-center gap-3")}>
        <Logo className="shrink-0" imageClassName="h-7 sm:h-8" />
        <nav aria-label={t("landing2.nav.label")} className="ms-6 hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg">
                  {t(l.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <Toggles />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t("landing.signin")}</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register">{t("landing2.cta")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ workflow: the machine, station by station */
const STATIONS: Station[] = ["document", "check", "approve", "reuse"];

export function WorkflowSection() {
  const { t } = useI18n();
  const steps = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`landing2.how.s${n}.t` as TKey),
    text: t(`landing2.how.s${n}.d` as TKey),
    meta: t(`landing2.how.s${n}.m` as TKey),
  }));
  return (
    <section id="how" aria-labelledby="how-title" className="band scroll-mt-20 py-28 md:py-36">
      <div className={wrap}>
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-bold tracking-wide text-on-band-2">{t("landing2.how.eyebrow")}</p>
          <h2 id="how-title" className="font-display text-3xl text-on-band sm:text-[2.6rem] sm:leading-[1.1] rtl:leading-snug">
            {t("landing2.how.title")}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-band-2 sm:text-base">{t("landing2.how.sub")}</p>
        </div>

        <ol className="relative mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* the conveyor that links the stations */}
          <span className="absolute inset-x-6 top-[7.25rem] hidden h-3 rounded-full border-2 border-on-band/70 lg:block" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-[repeating-linear-gradient(90deg,transparent_0_22px,color-mix(in_srgb,var(--on-band)_55%,transparent)_22px_30px)]" />
          </span>
          {steps.map((s, i) => (
            <li key={s.n} className="relative flex flex-col">
              <div className="relative z-10 grid h-40 place-items-center rounded-2xl border-2 border-on-band/80 bg-surface p-4 shadow-[4px_4px_0_var(--band-2)]">
                <StationArt kind={STATIONS[i]} className="h-28 w-auto" />
              </div>
              <p className="num mt-5 text-xs font-bold tracking-widest text-on-band-2">
                {t("landing2.how.station")} {String(s.n).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-xl font-extrabold text-on-band">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-on-band-2">{s.text}</p>
              <p className="mt-3 text-xs font-semibold text-on-band/85">{s.meta}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ evidence-grounded AI: the inspection desk */
const STATUS_ROWS: { status: ClaimStatus; icon: React.ElementType; tone: string; fill: string; key: TKey }[] = [
  { status: "supported", icon: CheckCircle2, tone: "text-ok", fill: "bg-ok-soft", key: "landing2.ev.supported" },
  { status: "needs_confirmation", icon: UserCheck, tone: "text-warn", fill: "bg-warn-soft", key: "landing2.ev.needs_confirmation" },
  { status: "unsupported", icon: CircleSlash, tone: "text-bad", fill: "bg-bad-soft", key: "landing2.ev.unsupported" },
  { status: "contradicted", icon: ShieldAlert, tone: "text-bad", fill: "bg-bad-soft", key: "landing2.ev.contradicted" },
];

export function EvidenceSection() {
  const { t, locale } = useI18n();
  const principles: { t: TKey; d: TKey }[] = [
    { t: "landing2.ev.p1.t", d: "landing2.ev.p1.d" },
    { t: "landing2.ev.p2.t", d: "landing2.ev.p2.d" },
    { t: "landing2.ev.p3.t", d: "landing2.ev.p3.d" },
  ];
  return (
    <section id="evidence" aria-labelledby="evidence-title" className="scroll-mt-20 py-20 md:py-28">
      <div className={cn(wrap, "grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20")}>
        <div>
          <SectionIntro id="evidence-title" eyebrow={t("landing2.ev.eyebrow")} title={t("landing2.ev.title")} sub={t("landing2.ev.sub")} />
          <ol className="mt-10 flex max-w-xl flex-col gap-6">
            {principles.map((p, i) => (
              <li key={p.t} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
                <span className="num grid size-10 place-items-center rounded-xl bg-primary text-sm font-extrabold text-on-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-fg">{t(p.t)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">{t(p.d)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel-ink overflow-hidden bg-surface">
          <div className="flex items-center gap-3 border-b border-border bg-primary-soft px-6 py-4">
            <StationArt kind="check" className="h-10 w-auto" />
            <h3 className="text-sm font-extrabold text-fg">{t("landing2.ev.statuses")}</h3>
          </div>
          <dl className="divide-y divide-border-soft">
            {STATUS_ROWS.map(({ status, icon: Icon, tone, fill, key }) => (
              <div key={status} className="px-6 py-5">
                <dt className={cn("flex items-center gap-4 text-sm font-extrabold", tone)}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", fill)} aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  {claimStatusLabel(status, locale)}
                </dt>
                <dd className="-mt-2 ps-[3.25rem] text-sm leading-relaxed text-fg-2">{t(key)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ features: an asymmetric mosaic, one colour per area */
const TONES: TKey[] = ["tone.professional", "tone.inspiring", "tone.storytelling", "tone.concise", "tone.humble", "tone.technical"];

export function FeaturesSection() {
  const { t } = useI18n();
  const tiles: { icon: React.ElementType; t: TKey; d: TKey; tone: string }[] = [
    { icon: FileText, t: "landing2.f.cv.t", d: "landing2.f.cv.d", tone: "tone-sky" },
    { icon: ScanSearch, t: "landing2.f.tailor.t", d: "landing2.f.tailor.d", tone: "tone-amber" },
    { icon: Briefcase, t: "landing2.f.jobs.t", d: "landing2.f.jobs.d", tone: "tone-green" },
    { icon: Target, t: "landing2.f.gap.t", d: "landing2.f.gap.d", tone: "tone-teal" },
    { icon: Languages, t: "landing2.f.lang.t", d: "landing2.f.lang.d", tone: "tone-violet" },
  ];
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 bg-surface py-20 md:py-28">
      <div className={wrap}>
        <SectionIntro id="features-title" eyebrow={t("landing2.f.eyebrow")} title={t("landing2.f.title")} />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {/* spotlight: the LinkedIn studio, in the brand colour */}
          <article className="relative overflow-hidden rounded-2xl bg-[linear-gradient(160deg,var(--band)_0%,var(--band-2)_100%)] p-7 text-on-band sm:p-9 sm:pb-12 lg:col-span-2 lg:row-span-2">
            <PenLine className="size-6" aria-hidden />
            <h3 className="mt-5 font-display text-[1.9rem] leading-tight">{t("landing2.f.studio.t")}</h3>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-on-band-2">{t("landing2.f.studio.d")}</p>
            <p className="mt-8 text-xs font-bold tracking-wide text-on-band-2">{t("landing2.f.studio.tones")}</p>
            <ul className="mt-3 flex max-w-xl flex-wrap gap-2 sm:pe-28">
              {TONES.map((k) => (
                <li key={k} className="rounded-full border border-on-band/40 bg-on-band/10 px-3 py-1 text-sm font-semibold">
                  {t(k)}
                </li>
              ))}
            </ul>
            <p className="mt-8 flex items-center gap-2 text-sm font-semibold sm:pe-40">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              {t("landing2.pv.approve.d")}
            </p>
            <SpotArt
              kind="studio"
              className="pointer-events-none absolute end-6 -bottom-4 hidden h-40 w-auto [--art-paper:var(--surface)] sm:block"
            />
          </article>

          {tiles.map(({ icon: Icon, t: tk, d, tone }) => (
            <article key={tk} className={cn(tone, "relative overflow-hidden rounded-2xl border border-border bg-tone-soft p-6")}>
              <span className="grid size-10 place-items-center rounded-xl bg-surface text-tone shadow-sm" aria-hidden>
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-extrabold text-fg">{t(tk)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{t(d)}</p>
            </article>
          ))}
        </div>

        <div className="mt-20">
          <h3 className="font-display text-2xl text-fg">{t("landing2.preview.title")}</h3>
          <p className="mt-2 max-w-xl text-[15px] text-fg-2">{t("landing2.preview.sub")}</p>
          <ProductPreview className="mt-8" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ privacy & control */
export function PrivacySection() {
  const { t } = useI18n();
  const items: { icon: React.ElementType; t: TKey; d: TKey }[] = [
    { icon: EyeOff, t: "landing2.pv.pii.t", d: "landing2.pv.pii.d" },
    { icon: ServerCog, t: "landing2.pv.providers.t", d: "landing2.pv.providers.d" },
    { icon: KeyRound, t: "landing2.pv.byok.t", d: "landing2.pv.byok.d" },
    { icon: ShieldCheck, t: "landing2.pv.guard.t", d: "landing2.pv.guard.d" },
    { icon: UserCheck, t: "landing2.pv.approve.t", d: "landing2.pv.approve.d" },
    { icon: Download, t: "landing2.pv.data.t", d: "landing2.pv.data.d" },
  ];
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-20 py-20 md:py-28">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16")}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionIntro id="privacy-title" eyebrow={t("landing2.pv.eyebrow")} title={t("landing2.pv.title")} sub={t("landing2.pv.sub")} />
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map(({ icon: Icon, t: tk, d }) => (
            <li key={tk} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-text">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-extrabold text-fg">{t(tk)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{t(d)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ closing call to action */
export function ClosingCta() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="end-title" className="pb-24 md:pb-32">
      <div className={wrap}>
        <div className="panel-ink grid items-center gap-10 bg-primary-soft px-6 py-10 sm:px-12 md:grid-cols-[auto_minmax(0,1fr)_auto] md:py-12">
          <ChartArt className="hidden h-32 w-auto md:block" />
          <div className="max-w-xl">
            <h2 id="end-title" className="font-display text-3xl text-fg sm:text-[2.5rem] sm:leading-[1.1]">
              {t("landing2.end.title")}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t("landing2.end.sub")}</p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <Button asChild size="lg">
              <Link href="/register">
                {t("landing2.hero.cta")}
                <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
            <Link href="/login" className="text-sm font-semibold text-primary-text hover:underline">
              {t("landing2.end.signin")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */
export function LandingFooter() {
  const { t } = useI18n();
  const link = "text-sm text-fg-2 transition-colors hover:text-fg";
  return (
    <footer className="border-t border-border bg-surface">
      <div className={cn(wrap, "grid gap-10 py-12 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]")}>
        <div className="max-w-sm">
          <Logo imageClassName="h-7" />
          <p className="mt-4 text-sm leading-relaxed text-fg-3">{t("brand.tagline")}</p>
          <Toggles className="mt-4 -ms-2" />
        </div>
        <nav aria-labelledby="foot-product">
          <h2 id="foot-product" className="text-xs font-semibold text-fg">
            {t("landing2.foot.product")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={link}>
                  {t(l.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="foot-account">
          <h2 id="foot-account" className="text-xs font-semibold text-fg">
            {t("landing2.foot.account")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/login" className={link}>
                {t("landing.signin")}
              </Link>
            </li>
            <li>
              <Link href="/register" className={link}>
                {t("landing2.cta")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className={cn(wrap, "flex flex-col gap-2 py-5 text-xs text-fg-3 sm:flex-row sm:items-center sm:justify-between")}>
          <span>{t("landing2.foot.rights")}</span>
          <span>{t("landing.footer")}</span>
        </div>
      </div>
    </footer>
  );
}
