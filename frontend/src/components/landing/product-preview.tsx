"use client";

/**
 * Illustrative product preview for the landing page.
 * Built from the real design-system components (Badge, Status, ClaimReportPanel) with
 * obviously sample content. It is not connected to any API and shows no real person's data.
 */
import { ChevronRight, CircleSlash, FileText, GitBranch, Info, UserCheck } from "lucide-react";
import { ClaimReportPanel, type ClaimReport } from "@/components/claims";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Status } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function PaneHeader({ n, title, last }: { n: number; title: string; last?: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="num grid size-5 shrink-0 place-items-center rounded-full border border-border-strong text-[11px] font-semibold text-fg-2">
        {n}
      </span>
      <p className="text-xs font-semibold text-fg-2">{title}</p>
      {!last && <ChevronRight className="ms-auto hidden size-4 text-fg-3 lg:block rtl:rotate-180" aria-hidden />}
    </div>
  );
}

export function ProductPreview({ className }: { className?: string }) {
  const { t } = useI18n();

  const report: ClaimReport = {
    claims_checked: 4,
    unsupported_count: 1,
    unsupported: [],
    passed: false,
    claims: [
      {
        id: "sample-flask",
        text: t("landing2.preview.claim.flask.text"),
        kind: "skill",
        value: "Flask",
        status: "supported",
        reasons: [],
        evidence: [{ source: "repository", quote: t("landing2.preview.claim.flask.quote") }],
        method: "sample",
      },
      {
        id: "sample-pg",
        text: t("landing2.preview.claim.pg.text"),
        kind: "skill",
        value: "PostgreSQL",
        status: "supported",
        reasons: [],
        evidence: [{ source: "repository", quote: t("landing2.preview.claim.pg.quote") }],
        method: "sample",
      },
      {
        id: "sample-speed",
        text: t("landing2.preview.claim.speed.text"),
        kind: "number",
        value: t("landing2.preview.claim.speed.value"),
        status: "unsupported",
        reasons: ["number_not_in_evidence"],
        evidence: [],
        method: "sample",
      },
      {
        id: "sample-led",
        text: t("landing2.preview.claim.led.text"),
        kind: "role",
        value: t("landing2.preview.claim.led.value"),
        status: "needs_confirmation",
        reasons: ["role_inflated"],
        evidence: [],
        method: "sample",
      },
    ],
  };

  const fakeButton = (variant: "primary" | "secondary" | "ghost") =>
    cn(buttonVariants({ variant, size: "xs" }), "pointer-events-none select-none");

  return (
    <figure className={cn("min-w-0", className)} aria-label={t("landing2.preview.label")}>
      <div className="doc-surface overflow-hidden rounded-xl">
        {/* frame bar */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
          </span>
          <span className="truncate text-xs text-fg-3">{t("landing2.preview.label")}</span>
          <Badge tone="outline" className="ms-auto">
            {t("landing2.preview.sample")}
          </Badge>
        </div>

        <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {/* 1 — achievement */}
          <div className="min-w-0 p-5">
            <PaneHeader n={1} title={t("landing2.preview.s1")} />
            <p className="text-sm font-semibold text-fg">{t("landing2.preview.ach.title")}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{t("landing2.preview.ach.desc")}</p>

            <div className="mt-4 text-xs font-medium text-fg-3">{t("landing2.preview.ach.sources")}</div>
            <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border text-sm">
              <li className="flex items-center gap-2 px-3 py-2 text-fg-2">
                <FileText className="size-4 shrink-0 text-fg-3" aria-hidden />
                {t("landing2.preview.ach.src1")}
              </li>
              <li className="flex items-center gap-2 px-3 py-2 text-fg-2">
                <GitBranch className="size-4 shrink-0 text-fg-3" aria-hidden />
                {t("landing2.preview.ach.src2")}
              </li>
            </ul>

            <div className="mt-4 text-xs font-medium text-fg-3">{t("landing2.preview.ach.skills")}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5" dir="ltr">
              <Badge>Python</Badge>
              <Badge>Flask</Badge>
              <Badge>PostgreSQL</Badge>
            </div>

            <Status tone="ok" className="mt-4">
              {t("landing2.preview.ach.contrib")}
            </Status>
          </div>

          {/* 2 — evidence check */}
          <div className="min-w-0 p-5">
            <PaneHeader n={2} title={t("landing2.preview.s2")} />
            <div className="text-xs font-medium text-fg-3">{t("landing2.preview.draft.label")}</div>
            <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fg">{t("landing2.preview.draft.text")}</p>
            <ClaimReportPanel report={report} showSupported className="mt-4" />
          </div>

          {/* 3 — Master CV suggestion */}
          <div className="min-w-0 p-5">
            <PaneHeader n={3} title={t("landing2.preview.s3")} last />
            <Badge tone="brand">{t("landing2.preview.sug.draft")}</Badge>
            <div className="mt-4 text-xs font-medium text-fg-3">{t("landing2.preview.sug.section")}</div>
            <p className="mt-1.5 border-s-2 border-ok ps-3 text-sm leading-relaxed text-fg">{t("landing2.preview.sug.bullet")}</p>

            <ul className="mt-4 flex flex-col gap-2 text-xs text-fg-2">
              <li className="flex gap-2">
                <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden />
                {t("landing2.preview.sug.removed")}
              </li>
              <li className="flex gap-2">
                <UserCheck className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                {t("landing2.preview.sug.changed")}
              </li>
            </ul>

            {/* Static depiction of the review controls; the real ones live in the Master CV workspace. */}
            <div className="mt-5 flex flex-wrap gap-2" aria-hidden>
              <span className={fakeButton("primary")}>{t("common.accept")}</span>
              <span className={fakeButton("secondary")}>{t("common.edit")}</span>
              <span className={fakeButton("ghost")}>{t("common.reject")}</span>
            </div>
            <p className="mt-3 text-xs text-fg-3">{t("landing2.preview.sug.note")}</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 flex items-start gap-1.5 text-xs text-fg-3">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {t("landing2.preview.caption")}
      </figcaption>
    </figure>
  );
}
