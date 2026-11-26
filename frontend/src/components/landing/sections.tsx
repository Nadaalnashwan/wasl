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
import { claimStatusLabel, type ClaimStatus } from "@/components/claims";
import { Logo, Toggles } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
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
      <p className="eyebrow mb-3">{eyebrow}</p>
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

/* ------------------------------------------------------------------ workflow */
export function WorkflowSection() {
  const { t } = useI18n();
  const steps = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`landing2.how.s${n}.t` as TKey),
    text: t(`landing2.how.s${n}.d` as TKey),
    meta: t(`landing2.how.s${n}.m` as TKey),
  }));
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t border-border py-20 md:py-28">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-20")}>
        <SectionIntro
          id="how-title"
          eyebrow={t("landing2.how.eyebrow")}
          title={t("landing2.how.title")}
          sub={t("landing2.how.sub")}
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <ol className="flex flex-col">
          {steps.map((s, i) => (
            <li key={s.n} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-5 pb-10 last:pb-0">
              {i < steps.length - 1 && <span className="absolute start-4 top-9 bottom-1 w-px bg-border" aria-hidden />}
              <span className="num grid size-8 place-items-center rounded-full border border-border-strong bg-surface text-sm font-semibold text-fg">
                {s.n}
              </span>
              <div className="pt-1">
                <h3 className="text-heading font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{s.text}</p>
                <p className="mt-3 text-xs font-medium text-fg-3">{s.meta}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ evidence-grounded AI */
const STATUS_ROWS: { status: ClaimStatus; icon: React.ElementType; tone: string; key: TKey }[] = [
  { status: "supported", icon: CheckCircle2, tone: "text-ok", key: "landing2.ev.supported" },
  { status: "needs_confirmation", icon: UserCheck, tone: "text-warn", key: "landing2.ev.needs_confirmation" },
  { status: "unsupported", icon: CircleSlash, tone: "text-bad", key: "landing2.ev.unsupported" },
  { status: "contradicted", icon: ShieldAlert, tone: "text-bad", key: "landing2.ev.contradicted" },
];

export function EvidenceSection() {
  const { t, locale } = useI18n();
  const principles: { t: TKey; d: TKey }[] = [
    { t: "landing2.ev.p1.t", d: "landing2.ev.p1.d" },
    { t: "landing2.ev.p2.t", d: "landing2.ev.p2.d" },
    { t: "landing2.ev.p3.t", d: "landing2.ev.p3.d" },
  ];
  return (
    <section id="evidence" aria-labelledby="evidence-title" className="scroll-mt-20 border-y border-border bg-surface py-20 md:py-28">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-2 lg:gap-20")}>
        <div>
          <SectionIntro id="evidence-title" eyebrow={t("landing2.ev.eyebrow")} title={t("landing2.ev.title")} sub={t("landing2.ev.sub")} />
          <ul className="mt-10 flex max-w-xl flex-col divide-y divide-border border-y border-border">
            {principles.map((p) => (
              <li key={p.t} className="flex gap-3 py-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-fg">{t(p.t)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-2">{t(p.d)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:pt-10">
          <h3 className="text-sm font-semibold text-fg">{t("landing2.ev.statuses")}</h3>
          <dl className="mt-4 divide-y divide-border rounded-lg border border-border-soft bg-bg">
            {STATUS_ROWS.map(({ status, icon: Icon, tone, key }) => (
              <div key={status} className="px-5 py-4">
                <dt className={cn("flex items-center gap-3 text-sm font-semibold", tone)}>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {claimStatusLabel(status, locale)}
                </dt>
                <dd className="mt-1 ps-7 text-sm leading-relaxed text-fg-2">{t(key)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ features */
const TONES: TKey[] = ["tone.professional", "tone.inspiring", "tone.storytelling", "tone.concise", "tone.humble", "tone.technical"];

export function FeaturesSection() {
  const { t } = useI18n();
  const rows: { icon: React.ElementType; t: TKey; d: TKey }[] = [
    { icon: FileText, t: "landing2.f.cv.t", d: "landing2.f.cv.d" },
    { icon: Briefcase, t: "landing2.f.jobs.t", d: "landing2.f.jobs.d" },
    { icon: ScanSearch, t: "landing2.f.tailor.t", d: "landing2.f.tailor.d" },
    { icon: Target, t: "landing2.f.gap.t", d: "landing2.f.gap.d" },
    { icon: Languages, t: "landing2.f.lang.t", d: "landing2.f.lang.d" },
  ];
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-20 md:py-28">
      <div className={wrap}>
        <SectionIntro id="features-title" eyebrow={t("landing2.f.eyebrow")} title={t("landing2.f.title")} />

        {/* featured: LinkedIn studio, split */}
        <div className="mt-12 grid overflow-hidden rounded-lg border border-border-soft bg-surface lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="p-6 sm:p-8">
            <PenLine className="size-5 text-primary" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-fg">{t("landing2.f.studio.t")}</h3>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-fg-2">{t("landing2.f.studio.d")}</p>
          </div>
          <div className="border-t border-border bg-surface-2 p-6 sm:p-8 lg:border-s lg:border-t-0">
            <p className="text-xs font-medium text-fg-3">{t("landing2.f.studio.tones")}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {TONES.map((k) => (
                <li key={k}>
                  <Badge tone="outline" className="h-7 bg-surface px-2.5 text-sm">
                    {t(k)}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-center gap-2 text-sm text-fg-2">
              <ShieldCheck className="size-4 shrink-0 text-ok" aria-hidden />
              {t("landing2.pv.approve.d")}
            </p>
          </div>
        </div>

        {/* editorial rows */}
        <ul className="mt-12 divide-y divide-border border-y border-border">
          {rows.map(({ icon: Icon, t: tk, d }) => (
            <li key={tk} className="grid gap-2 py-6 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-10">
              <div className="flex items-center gap-3">
                <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />
                <h3 className="text-[15px] font-semibold text-fg">{t(tk)}</h3>
              </div>
              <p className="text-[15px] leading-relaxed text-fg-2 md:ps-0 ps-7">{t(d)}</p>
            </li>
          ))}
        </ul>
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
    <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-20 border-t border-border py-20 md:py-28">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-20")}>
        <SectionIntro id="privacy-title" eyebrow={t("landing2.pv.eyebrow")} title={t("landing2.pv.title")} sub={t("landing2.pv.sub")} />
        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {items.map(({ icon: Icon, t: tk, d }) => (
            <li key={tk}>
              <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-text">
                <Icon className="size-4" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-fg">{t(tk)}</h3>
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
    <section aria-labelledby="end-title" className="pb-20 md:pb-28">
      <div className={wrap}>
        <div className="flex flex-col gap-8 rounded-2xl border border-border bg-surface px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between md:py-12">
          <div className="max-w-xl">
            <h2 id="end-title" className="font-display text-3xl text-fg sm:text-[2.5rem]">
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
            <Link href="/login" className="text-sm font-medium text-primary-text hover:underline">
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
