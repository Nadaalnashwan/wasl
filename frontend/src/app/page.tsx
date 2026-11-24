"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ProductPreview } from "@/components/landing/product-preview";
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
        {/* Hero */}
        <section aria-labelledby="hero-title" className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 md:pt-24 md:pb-28 lg:px-8">
          <div className="max-w-3xl">
            <p className="eyebrow mb-5 flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-primary" aria-hidden />
              {t("landing2.hero.eyebrow")}
            </p>
            <h1
              id="hero-title"
              className="text-[2.5rem] leading-[1.08] font-semibold tracking-tight text-fg sm:text-5xl lg:text-display rtl:leading-[1.3]"
            >
              <span className="block">{t("landing2.hero.t1")}</span>
              <span className="block text-fg-3">{t("landing2.hero.t2")}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-2 sm:text-lg">{t("landing2.hero.sub")}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/register">
                  {t("landing2.hero.cta")}
                  <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="#how">{t("landing2.hero.secondary")}</a>
              </Button>
            </div>
            <p className="mt-6 text-sm text-fg-3">{t("landing2.hero.note")}</p>
          </div>

          <ProductPreview className="mt-16 md:mt-20" />
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
