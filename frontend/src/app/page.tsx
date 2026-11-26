"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { WaslMachine } from "@/components/brand/art";
import {
  ClosingCta,
  EvidenceSection,
  FeaturesSection,
  LandingFooter,
  LandingNav,
  PrivacySection,
  WorkflowSection,
} from "@/components/landing/sections";
import { FullPageSpinner } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";
import { Marked } from "@/components/ui/marked";

export default function Landing() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();

  // Signed-in visitors go straight to their workspace.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (!loading && user) return <FullPageSpinner />;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingNav />

      <main id="main" className="flex-1">
        {/* Hero: the headline beside the Wasl machine (v1's signature scene, redrawn) */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-y-0 end-0 hidden w-[46%] rounded-s-[3rem] bg-primary-soft/70 lg:block"
            aria-hidden
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 md:pt-20 md:pb-28 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:px-8">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-surface px-3 py-1 text-sm font-semibold text-primary-text shadow-sm">
                <ShieldCheck className="size-4" aria-hidden />
                {t("landing2.hero.eyebrow")}
              </p>
              <h1
                id="hero-title"
                className="font-display text-[2.6rem] leading-[1.05] text-fg sm:text-[3.4rem] lg:text-[3.6rem] rtl:leading-[1.3]"
              >
                <span className="block">
                  <Marked text={t("landing2.hero.t1")} mark={t("landing2.hero.mark")} />
                </span>
                <span className="brand-underline mt-1 block w-fit text-primary-text">{t("landing2.hero.t2")}</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-relaxed text-fg-2 sm:text-lg">{t("landing2.hero.sub")}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/register">
                    {t("landing2.hero.cta")}
                    <ArrowRight className="rtl:rotate-180" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#how">{t("landing2.hero.secondary")}</a>
                </Button>
              </div>
              <p className="mt-6 text-sm text-fg-3">{t("landing2.hero.note")}</p>
            </div>

            <figure className="panel-ink relative bg-surface p-5 sm:p-7">
              <WaslMachine className="h-auto w-full" label={t("landing2.hero.art")} />
              <figcaption className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-soft pt-4 text-xs font-semibold text-fg-2">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" aria-hidden />{t("landing2.hero.art.in")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" aria-hidden />{t("landing2.hero.art.check")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ok" aria-hidden />{t("landing2.hero.art.out")}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <WorkflowSection />
        <EvidenceSection />
        <FeaturesSection />
        <PrivacySection />
        <ClosingCta />
      </main>

      <LandingFooter />
    </div>
  );
}
