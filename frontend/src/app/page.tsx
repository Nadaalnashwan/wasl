
"use client";

import {
  Activity,
  ArrowRight,
  FileText,
  PenLine,
  Scissors,
  ShieldCheck,
  Target,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo, Toggles } from "@/components/shell/app-shell";
import {
  ChartArt,
  ClawArt,
  EmptyBoxArt,
  MachineScene,
  MonitorArt,
} from "@/components/sketch/illustrations";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";

function Arrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      className={className}
      aria-hidden="true"
    >
      <g
        filter="url(#rough)"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 24 C 34 6, 70 36, 108 18" />
        <path d="M96 10 L110 18 L98 30" />
      </g>
    </svg>
  );
}

export default function Landing() {
  const { t, locale } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const cta = "/register";
  const ctaLabel =
    locale === "ar" ? "إنشاء حساب" : "Sign up";

  const steps = [
    {
      art: <ClawArt className="h-32 w-auto" />,
      title: t("landing.step1.t"),
      text: t("landing.step1.d"),
    },
    {
      art: (
        <MonitorArt
          className="h-32 w-auto"
          text={locale === "ar" ? "تحقق…" : "verify…"}
        />
      ),
      title: t("landing.step2.t"),
      text: t("landing.step2.d"),
    },
    {
      art: <EmptyBoxArt className="h-32 w-auto" />,
      title: t("landing.step3.t"),
      text: t("landing.step3.d"),
    },
  ];

  const features = [
    {
      icon: PenLine,
      title: t("landing.f.studio"),
      text: t("landing.f.studio.d"),
    },
    {
      icon: FileText,
      title: t("landing.f.cv"),
      text: t("landing.f.cv.d"),
    },
    {
      icon: Scissors,
      title: t("landing.f.tailor"),
      text: t("landing.f.tailor.d"),
    },
    {
      icon: Target,
      title: t("landing.f.gap"),
      text: t("landing.f.gap.d"),
    },
    {
      icon: Activity,
      title: t("landing.f.monitor"),
      text: t("landing.f.monitor.d"),
    },
  ];

  if (loading || user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 md:px-8">
        <Logo />

        <div className="ms-auto flex items-center gap-2">
          <Toggles className="hidden sm:flex" />

          <Button asChild variant="outline" size="sm">
            <Link href="/login">
              {t("landing.signin")}
            </Link>
          </Button>

          <Button asChild size="sm">
            <Link href={cta}>
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-6 pb-16 md:px-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="pop-in">
          <div className="sketch-pill mb-5 inline-flex items-center gap-2 bg-sky px-3 py-1 font-hand text-base">
            <ShieldCheck className="size-4" />
            {locale === "ar"
              ? "لا معلومات مختلقة"
              : "Nothing invented. Ever."}
          </div>

          <h1 className="font-hand text-5xl leading-[1.05] md:text-6xl">
            {locale === "ar" ? (
              <>
                وثّق إنجازك{" "}
                <span className="marker">
                  مرة واحدة
                </span>
                . واستخدمه في كل مكان.
              </>
            ) : (
              <>
                Document an achievement{" "}
                <span className="marker">
                  once
                </span>
                . Use it everywhere.
              </>
            )}
          </h1>

          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            {t("landing.hero.sub")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={cta}>
                {ctaLabel}
                <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
            >
              <a href="#how">
                {t("landing.how")}
              </a>
            </Button>
          </div>
        </div>

        <div className="sketch bg-paper-2 p-3 md:p-5">
          <MachineScene
            className="h-auto w-full"
            screenText="wasl"
            outLabel={
              locale === "ar"
                ? "سيرة ✓"
                : "CV ✓"
            }
          />
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="border-y-[2.5px] border-ink bg-paper-2 py-16"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="mb-12 text-center font-hand text-4xl md:text-5xl">
            <span className="scribble">
              {t("landing.how")}
            </span>
          </h2>

          <div className="grid items-start gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="contents"
              >
                <div className="sketch flex flex-col items-center gap-3 p-6 text-center">
                  {s.art}

                  <div className="font-hand text-sm text-ink-faint">
                    0{i + 1}
                  </div>

                  <h3 className="font-hand text-2xl">
                    {s.title}
                  </h3>

                  <p className="text-sm text-ink-soft">
                    {s.text}
                  </p>
                </div>

                {i < steps.length - 1 && (
                  <Arrow className="mx-auto hidden w-24 self-center md:block rtl:-scale-x-100" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(
            ({ icon: Icon, title, text }, i) => (
              <div
                key={title}
                className="sketch p-6"
                style={{
                  transform: `rotate(${
                    [-0.6, 0.4, -0.3, 0.5, -0.4][i]
                  }deg)`,
                }}
              >
                <div className="mb-3 grid size-12 place-items-center rounded-xl border-[2.5px] border-ink bg-sky">
                  <Icon className="size-6" />
                </div>

                <h3 className="font-hand text-2xl">
                  {title}
                </h3>

                <p className="mt-2 text-sm text-ink-soft">
                  {text}
                </p>
              </div>
            )
          )}
        </div>
      </section>

      {/* Monitoring band */}
      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        <div className="sketch flex flex-col items-center gap-6 bg-sky p-8 md:flex-row">
          <ChartArt className="h-36 w-auto shrink-0" />

          <div className="flex-1">
            <h2 className="font-hand text-3xl">
              {t("landing.f.monitor")}
            </h2>

            <p className="mt-2 text-ink-soft">
              {t("landing.f.monitor.d")}
            </p>
          </div>

          <Button
            asChild
            size="lg"
            variant="outline"
          >
            <Link href={cta}>
              {ctaLabel}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t-[2.5px] border-ink py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 text-sm text-ink-soft md:px-8">
          <Image
            src="/brand/wasl-mark.png"
            alt=""
            width={498}
            height={646}
            className="h-8 w-auto"
          />

          <span>
            © 2026 Wasl — {t("brand.tagline")}
          </span>

          <span className="ms-auto">
            {t("landing.footer")}
          </span>
        </div>
      </footer>
    </div>
  );
}
