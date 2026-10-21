
"use client";

import {
  ArrowRight,
  Award,
  FileText,
  PenLine,
  Plus,
  Scissors,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { LinkedinIcon as Linkedin } from "@/components/brand-icons";
import Link from "next/link";
import {
  AchievementCard,
  AddAchievementDialog,
} from "@/components/achievements";
import {
  EmptyState,
  ErrorNote,
  Loading,
} from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, Stat } from "@/components/ui/card";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";
import type { Achievement } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type Summary = {
  achievements: {
    confirmed: number;
    pending: number;
    rejected: number;
  };
  posts: {
    draft: number;
    published: number;
    failed: number;
  };
  cv: {
    exists: boolean;
    version: number | null;
    updated_at: string | null;
    pending_suggestions: number;
    sections: Record<string, number> | null;
  };
  recent_achievements: Achievement[];
  integrations: Record<string, string>;
  last_analysis: {
    id: string;
    kind: string;
    job_title: string;
    match_score: number | null;
    created_at: string;
  } | null;
  recommendations: {
    key: string;
    count?: number;
    action: string;
    priority: string;
    available?: boolean;
  }[];
};

const REC_ICON: Record<string, React.ElementType> = {
  create_cv: FileText,
  review_suggestions: FileText,
  achievements_not_in_cv: FileText,
  achievements_not_posted: PenLine,
  connect_linkedin: Linkedin,
  try_gap: Target,
};

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } =
    useApi<Summary>("/api/dashboard");

  const recommendations =
    data?.recommendations.filter(
      (r) =>
        r.key !== "review_pending" &&
        r.key !== "connect_github" &&
        !r.action.startsWith("/discovery")
    ) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-hand text-4xl md:text-5xl">
          {t("dash.hello")},{" "}
          <span className="marker">
            {user?.full_name?.split(" ")[0] ||
              user?.email.split("@")[0]}
          </span>
        </h1>

        <p className="mt-3 text-ink-soft">
          {t("dash.sub")}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/studio">
              <PenLine /> {t("nav.studio")}
            </Link>
          </Button>

          <Button asChild variant="outline">
            <Link href="/tailor">
              <Scissors /> {t("nav.tailor")}
            </Link>
          </Button>
        </div>
      </div>

      <ErrorNote error={error} onRetry={reload} />

      {loading && !data && <Loading />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              icon={<Award />}
              label={t("dash.achievements")}
              value={data.achievements.confirmed}
              tone="sky"
            />

            <Stat
              icon={<Search />}
              label={t("dash.pending")}
              value={data.achievements.pending}
              hint={
                data.cv.pending_suggestions
                  ? `+ ${data.cv.pending_suggestions} CV drafts`
                  : undefined
              }
            />

            <Stat
              icon={<Linkedin />}
              label={t("dash.posts")}
              value={data.posts.published}
              hint={`${data.posts.draft} ${t(
                "post.status.draft"
              ).toLowerCase()}`}
            />

            <Stat
              icon={<FileText />}
              label={t("dash.cv")}
              value={
                data.cv.exists
                  ? `v${data.cv.version}`
                  : "—"
              }
              hint={
                data.cv.exists
                  ? fmtDate(data.cv.updated_at, locale)
                  : t("dash.cv.none")
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardTitle icon={<Sparkles />}>
                {t("dash.recent")}
              </CardTitle>

              {data.recent_achievements.length === 0 ? (
                <EmptyState
                  title={t("common.none")}
                  text={
                    locale === "ar"
                      ? "أضف أول إنجاز لك وسيبدأ وصل العمل."
                      : "Add your first achievement and the Wasl machine starts working."
                  }
                  action={
                    <AddAchievementDialog
                      onDone={reload}
                      trigger={
                        <Button size="sm">
                          <Plus /> {t("dash.add")}
                        </Button>
                      }
                    />
                  }
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {data.recent_achievements.map((a) => (
                    <AchievementCard
                      key={a.id}
                      a={a}
                      onChanged={reload}
                      compact
                    />
                  ))}
                </div>
              )}
            </Card>

            <div className="flex flex-col gap-6">
              <Card tone="sky">
                <CardTitle icon={<Target />}>
                  {t("dash.recs")}
                </CardTitle>

                {recommendations.length === 0 ? (
                  <p className="text-sm text-ink-soft">
                    {locale === "ar"
                      ? "كل شيء محدّث 🎉"
                      : "Everything is up to date 🎉"}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {recommendations.map((r) => {
                      const Icon =
                        REC_ICON[r.key] ?? Sparkles;

                      return (
                        <li key={r.key}>
                          <Link
                            href={r.action}
                            className="sketch-soft flex items-center gap-3 bg-paper p-3 transition-transform hover:-translate-y-0.5"
                          >
                            <Icon className="size-5 shrink-0" />

                            <span className="flex-1 text-sm">
                              {r.count ? (
                                <b>{r.count} </b>
                              ) : null}

                              {t(
                                `rec.${r.key}` as TKey
                              )}

                              {r.available === false && (
                                <Badge className="ms-2">
                                  {t(
                                    "common.notconfigured"
                                  )}
                                </Badge>
                              )}
                            </span>

                            <Badge
                              tone={
                                r.priority === "high"
                                  ? "warn"
                                  : "neutral"
                              }
                            >
                              {t(
                                `prio.${r.priority}` as TKey
                              )}
                            </Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardTitle icon={<FileText />}>
                  {t("dash.cv")}
                </CardTitle>

                {data.cv.exists &&
                data.cv.sections ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(
                      data.cv.sections
                    ).map(([k, v]) => (
                      <Badge key={k} tone="sky">
                        {t(
                          `cv.section.${k}` as TKey
                        )}
                        : {v}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft">
                    {t("cv.empty")}
                  </p>
                )}

                {data.last_analysis && (
                  <Link
                    href={
                      data.last_analysis.kind === "gap"
                        ? "/gap"
                        : "/tailor"
                    }
                    className="mt-4 flex items-center gap-3 rounded-xl bg-paper-2 p-3 text-sm"
                  >
                    <Target className="size-5" />

                    <span className="flex-1">
                      {data.last_analysis.job_title ||
                        "—"}{" "}
                      ·{" "}
                      {fmtDate(
                        data.last_analysis.created_at,
                        locale
                      )}
                    </span>

                    <span className="font-hand text-2xl">
                      {data.last_analysis.match_score ??
                        "—"}
                      %
                    </span>
                  </Link>
                )}

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-4"
                >
                  <Link href="/cv">
                    {t("nav.cv")}{" "}
                    <ArrowRight className="rtl:rotate-180" />
                  </Link>
                </Button>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
